# vector-by-vektra


Vector by Vektra — v1 Locked State
Product Position

Strategic trajectory instrument for competitive pickleball players.
Private-first. Discoverable in-app. Network intelligence gated by Pro.

Core Decisions Locked
Infrastructure

Hosting: Vercel

Database: Supabase (Postgres)

ORM: Prisma

Auth: Auth.js

Payments: Stripe

Batch: Vercel Cron (nightly) + admin trigger

Identity Model

Unique identifiable players

Shadow profiles allowed

Claim attaches historical matches automatically

Admin merge allowed (audited)

Identity edits allowed (audited)

Match Governance

Single-entry truth (v1)

60-minute owner edit window

Admin void (not hard delete)

Immutable audit log

Rating System

Doubles-aware ELO

Nightly full replay

Admin-triggerable recompute

Snapshot storage

Trajectory (Final Hybrid Model)

Primary: Rating slope

10 games (default)

7 days

1 month

Under-chart: Win % + Point differential

Monetization

Free:

Personal trajectory + personal predictions

Pro:

Network player visibility

Head-to-head intelligence

Network-based matchup probability

No public rankings.
No gamification.

Strategic Posture

Vector is:

Analytical

Controlled

Network-enabled but not reputation-exploitative

Architected for scale without premature complexity

You now have:

Infrastructure clarity

Governance clarity

Data model clarity

Monetization clarity

UX clarity
