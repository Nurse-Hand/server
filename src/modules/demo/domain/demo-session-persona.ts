export const DEMO_SESSION_PERSONAS = ['SENDER', 'RECEIVER'] as const;

export type DemoSessionPersona = (typeof DEMO_SESSION_PERSONAS)[number];
