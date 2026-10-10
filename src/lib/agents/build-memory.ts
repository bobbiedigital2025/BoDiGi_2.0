/**
 * Build Memory — BoDiGi's learning loop.
 *
 * The codegen agents are stateless one-shot calls: without this module,
 * every build starts with total amnesia. Build Memory fixes that:
 *
 *   WRITE  learnFromModification() — every Modify Pass is direct user
 *          feedback about what the generator got wrong. Generalized into
 *          a rule so the next build gets it right by default.
 *   WRITE  reflectOnBuild() — after each build, extract lessons from
 *          fallbacks, retries, and structure (only when there's signal).
 *   READ   withLearnedRules() — before an agent generates, append the
 *          most relevant learned rules to its prompt.
 *
 * Hard rule: memory is a bonus, never a failure. Every function in this
 * module swallows its own errors — a broken memory table must never
 * break a build.
 */

import { createAdminClient, hasSupabase } from '../supabase/server';
import { callAI, hasAIKey } from './ai-client';

export type LessonRole = 'frontend' | 'backend' | 'database' | 'pm' | 'architect' | 'general';

interface LessonRow {
  id: string;
  agent_role: string;
  lesson: string;
}

const MAX_PROMPT_LESSONS = 6;
const MAX_LESSON_LENGTH = 220;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Fetch recent lessons for a role (plus 'general') and format them as a
 * prompt block. Returns '' when memory is unavailable or empty — callers
 * just append it, no branching needed.
 */
export async function getLessonsForPrompt(role: LessonRole, limit = MAX_PROMPT_LESSONS): Promise<string> {
  try {
    if (!hasSupabase()) return '';
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('build_lessons')
      .select('id, agent_role, lesson')
      .in('agent_role', [role, 'general'])
      .order('created_at', { ascending: false })
      .limit(25);
    if (error || !data || data.length === 0) return '';

    // Dedupe by normalized text, keep freshest first
    const seen = new Set<string>();
    const picked: LessonRow[] = [];
    for (const row of data as LessonRow[]) {
      const key = normalize(row.lesson);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(row);
      if (picked.length >= limit) break;
    }

    // Reinforcement: bump applied_count for served lessons (fire-and-forget)
    const ids = picked.map((p) => p.id);
    void Promise.all(
      ids.map((id) =>
        admin.rpc('increment_lesson_applied', { lesson_id: id }).then(() => undefined, () => undefined)
      )
    ).catch(() => undefined);

    const lines = picked.map((p) => `- ${p.lesson.slice(0, MAX_LESSON_LENGTH)}`);
    return `\n\nLEARNED RULES — from past builds. Follow these strictly, they come from real user feedback:\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

/** Append learned rules to a prompt for the given role. */
export async function withLearnedRules(role: LessonRole, prompt: string): Promise<string> {
  const block = await getLessonsForPrompt(role);
  return block ? prompt + block : prompt;
}

/** Insert a lesson, skipping near-duplicates. Never throws. */
export async function recordLesson(
  role: LessonRole,
  lesson: string,
  opts: { category?: string; source: string; projectId?: string }
): Promise<void> {
  try {
    if (!hasSupabase()) return;
    const clean = lesson.replace(/\s+/g, ' ').trim();
    if (clean.length < 12 || clean.length > 500) return;

    const admin = createAdminClient();

    // Near-duplicate check against recent lessons for this role
    const { data: recent } = await admin
      .from('build_lessons')
      .select('lesson')
      .eq('agent_role', role)
      .order('created_at', { ascending: false })
      .limit(50);
    const key = normalize(clean);
    if ((recent || []).some((r: { lesson: string }) => {
      const existing = normalize(r.lesson);
      return existing === key || existing.includes(key) || key.includes(existing);
    })) {
      return;
    }

    await admin.from('build_lessons').insert({
      agent_role: role,
      lesson: clean,
      category: opts.category || 'quality',
      source: opts.source,
      project_id: opts.projectId || null,
    });
  } catch {
    // memory is a bonus, never a failure
  }
}

const MODIFY_LEARN_PROMPT = `You are the memory system of an AI app-builder. A user who generated an app just asked for this modification:

"{INSTRUCTION}"

Files changed: {FILES}

Decide if this request generalizes into a rule the code generator should follow BY DEFAULT in every future app (for example: "add a settings page" → every app should ship with a settings page; "let me sign up, not just log in" → auth pages must include sign-up).

Reply with EXACTLY ONE of:
- A single concise rule (max 30 words), imperative form, no preamble.
- The word SKIP if this is project-specific content/styling with no general lesson.`;

/**
 * Learn from a Modify Pass. The user's instruction is the clearest signal
 * we get about what the generator failed to do right the first time.
 */
export async function learnFromModification(
  projectId: string,
  instruction: string,
  changedPaths: string[],
  log?: (level: 'info' | 'warn', msg: string) => void
): Promise<void> {
  try {
    if (!hasAIKey() || changedPaths.length === 0) return;

    const raw = await callAI(
      'You convert user edit requests into general code-generation rules. You reply with one rule or the word SKIP.',
      MODIFY_LEARN_PROMPT
        .replace('{INSTRUCTION}', instruction.slice(0, 500))
        .replace('{FILES}', changedPaths.slice(0, 10).join(', '))
    );

    const lesson = raw.trim().replace(/^["']|["']$/g, '').trim();
    if (!lesson || /^skip\b/i.test(lesson) || lesson.length < 12) return;

    // Route the lesson to the role whose files were touched (default frontend —
    // most modify passes are UI changes)
    const role: LessonRole =
      changedPaths.some((p) => p.includes('/api/')) ? 'backend'
      : changedPaths.some((p) => p.includes('schema') || p.includes('migration') || p.includes('supabase')) ? 'database'
      : 'frontend';

    await recordLesson(role, lesson, { category: 'user-preference', source: 'modify-pass', projectId });
    log?.('info', `Build memory: learned from your edit — "${lesson.slice(0, 100)}"`);
  } catch {
    // non-fatal
  }
}

const REFLECTION_PROMPT = `You are the memory system of an AI app-builder reviewing a finished build.

App: {SUMMARY}
Files generated: {FILES}
Build warnings (fallbacks/retries): {WARNINGS}

Extract 0-3 lessons that would make the NEXT build of any app better. Only general, reusable rules — never project-specific content. If warnings show a failure pattern, turn it into a prevention rule. If the build was clean with no warnings, it is fine to return an empty list.

Return JSON only: {"lessons": [{"role": "frontend|backend|database|general", "lesson": "..."}]}`;

/**
 * Post-build reflection. Fire after the final state is saved; the build is
 * already complete, so this must never throw or delay meaningfully.
 */
export async function reflectOnBuild(
  projectId: string,
  summary: string,
  filePaths: string[],
  warnings: string[],
  log?: (level: 'info' | 'warn', msg: string) => void
): Promise<void> {
  try {
    if (!hasAIKey()) return;

    const raw = await callAI(
      'You extract reusable engineering lessons from build reports. You reply with JSON only.',
      REFLECTION_PROMPT
        .replace('{SUMMARY}', summary.slice(0, 300))
        .replace('{FILES}', filePaths.slice(0, 25).join(', '))
        .replace('{WARNINGS}', warnings.length ? warnings.slice(0, 10).join(' | ') : 'none')
    );

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]);
    const lessons: Array<{ role?: string; lesson?: string }> = Array.isArray(parsed.lessons) ? parsed.lessons : [];

    const validRoles: LessonRole[] = ['frontend', 'backend', 'database', 'pm', 'architect', 'general'];
    let stored = 0;
    for (const item of lessons.slice(0, 3)) {
      if (!item?.lesson || typeof item.lesson !== 'string') continue;
      const role = validRoles.includes(item.role as LessonRole) ? (item.role as LessonRole) : 'general';
      await recordLesson(role, item.lesson, { category: 'quality', source: 'build-review', projectId });
      stored++;
    }
    if (stored > 0) log?.('info', `Build memory: ${stored} lesson${stored > 1 ? 's' : ''} stored from this build`);
  } catch {
    // non-fatal
  }
}
