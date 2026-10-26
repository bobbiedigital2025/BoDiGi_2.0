/**
 * Agent Intros — customer-facing identity cards for the build pipeline.
 *
 * The named identities were created by Juno on Sept 26 2026 (see AGENT_NAMES
 * in types.ts). This file carries the full story for each agent — why the
 * name, what the agent does in plain language, and why it matters to the
 * BoDiGi 2.0 promise — so the build progress UI can introduce each agent
 * when its step becomes active. Copy written by Rune, Oct 25 2026, at
 * Bobbie's request.
 *
 * Intended UI (dashboard/pipeline seam, owned by Juno):
 *   When an agent's stage activates during a build, show an intro card:
 *   thumbnail + name + whyNamed + whatTheyDo + whyItMatters.
 *   `thumbnail` is optional until avatar assets are added under public/agents/.
 */
import type { AgentRole } from './types';
import { AGENT_NAMES } from './types';

export interface AgentIntro {
  role: AgentRole;
  name: string;
  /** One-line story behind the name — customer-facing. */
  whyNamed: string;
  /** Plain-language job description — no jargon. */
  whatTheyDo: string;
  /** Why this agent matters to BoDiGi 2.0's promise. */
  whyItMatters: string;
  /** Avatar thumbnail under /public/agents/ — optional until assets exist. */
  thumbnail?: string;
}

export const AGENT_INTROS: Record<AgentRole, AgentIntro> = {
  pm: {
    role: 'pm',
    name: AGENT_NAMES.pm,
    whyNamed: 'A nova is a star that suddenly blazes bright — every build starts with a flash of an idea.',
    whatTheyDo: 'Turns your one paragraph into a real plan: who the app is for, what it does, and what gets built first.',
    whyItMatters: 'Nova is the first agent to touch your idea. She is the difference between "AI wrote some code" and "AI understood my business."',
  },
  architect: {
    role: 'architect',
    name: AGENT_NAMES.architect,
    whyNamed: 'In the old stories, Atlas holds up the world. He holds up your whole app.',
    whatTheyDo: 'Designs the skeleton before anyone writes a line — the pages, the data flow, the tech stack.',
    whyItMatters: 'A build without Atlas is a pile of files. With him, it is a structure that will not fall over when it grows.',
  },
  frontend: {
    role: 'frontend',
    name: AGENT_NAMES.frontend,
    whyNamed: 'A prism takes one beam of light and splits it into every color. Your idea is the beam; your screens are the colors.',
    whatTheyDo: 'Builds every page you and your users will actually see and touch.',
    whyItMatters: 'People judge an app in seconds. Prism is why "AI-built" never has to mean "ugly."',
  },
  backend: {
    role: 'backend',
    name: AGENT_NAMES.backend,
    whyNamed: 'A forge is where raw metal becomes machinery.',
    whatTheyDo: 'Builds the engine room — the logic, the connections, the work that happens behind every button.',
    whyItMatters: 'Pretty without working is just a brochure. Forge makes it work.',
  },
  database: {
    role: 'database',
    name: AGENT_NAMES.database,
    whyNamed: 'A vault keeps what is precious safe.',
    whatTheyDo: 'Designs where your data lives — every user, every order, every record — and locks it down.',
    whyItMatters: 'Your data is your business. Clean data design is also how we keep the promise: your code, your hosting, your keys. No lock-in.',
  },
  testing: {
    role: 'testing',
    name: AGENT_NAMES.testing,
    whyNamed: 'A scout rides ahead and spots trouble before it arrives.',
    whatTheyDo: 'Attacks the app like the meanest user would — and breaks it before your customers can.',
    whyItMatters: 'Every bug Scout catches is a bug your first customer never sees. That is the difference between a demo and a business.',
  },
  devops: {
    role: 'devops',
    name: AGENT_NAMES.devops,
    whyNamed: 'A pilot gets the plane off the ground — and keeps it flying.',
    whatTheyDo: 'Handles deployment: getting your app out of the workshop and onto real hosting you own.',
    whyItMatters: 'An app that is not deployed is a screenshot. Pilot is the "own it forever" promise, made real.',
  },
  compliance: {
    role: 'compliance',
    name: AGENT_NAMES.compliance,
    whyNamed: 'The aegis was the shield of the gods — the original protection.',
    whatTheyDo: 'Reviews everything for security, privacy, legal, and accessibility before it ships.',
    whyItMatters: 'Aegis is why you can bring us an idea without inheriting a lawsuit.',
  },
  docs: {
    role: 'docs',
    name: AGENT_NAMES.docs,
    whyNamed: 'Scribes were how civilizations remembered things.',
    whatTheyDo: 'Writes your README, your investor one-pager, your Reality Check, and your Marketing Kit.',
    whyItMatters: 'The documents are half the value of a BoDiGi build. Scribe is why you can show investors something real on day one.',
  },
  healing: {
    role: 'healing',
    name: AGENT_NAMES.healing,
    whyNamed: 'To mend is to fix what broke — quietly, without starting over.',
    whatTheyDo: 'Watches the build, catches failures mid-flight, and repairs them so the build finishes.',
    whyItMatters: 'Mend is why builds complete instead of dying halfway. Self-healing is the difference between a demo and a factory.',
  },
};

/** Intro for any agent role — undefined for unknown roles. */
export function agentIntro(role: string): AgentIntro | undefined {
  return (AGENT_INTROS as Record<string, AgentIntro>)[role];
}
