# vector-by-vektra


##Vector by Vektra — v1 Locked State##

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

Identity Model — Detail

  Two records per person (max):

    User  — account layer: email, handle, displayName, passwordHash, role, plan
            Created at registration. No Player created automatically.
            Email must be verified before claiming or creating a Player.

    Player — stats layer: displayName, rating, match history, trustTier (unverified | verified_email)
            Created either:
              a) by admin entering a match (shadow profile: userId = null, claimed = false)
              b) by user claiming an existing shadow (userId linked, claimed = true)
              c) by user creating a fresh profile (userId linked, claimed = true, rating = 1000)

  Shadow profiles:
    - Created by findOrCreateShadowPlayer() on match entry
    - Case-insensitive, trimmed name lookup — reuses existing shadow if found
    - Accumulate match history and ratings before any user claims them
    - No database-level uniqueness constraint on displayName (code-level deduplication only)

  displayName — two independent fields:
    User.displayName   set at registration, no user-facing edit endpoint
    Player.displayName set at shadow/profile creation, admin-editable only (audited)
    When claiming a shadow: Player.displayName is NOT overwritten by User.displayName
    When creating fresh:    Player.displayName pre-filled from User.displayName (user can change at creation time)

  Claim flow (post-login, /command screen):
    1. User verifies email
    2. User searches unclaimed shadows by name
    3. "This is me" → POST /api/players/{id}/claim
       Player.userId set, claimed = true, trustTier = verified_email
       All historical matches and ratings carry over automatically
    OR
    3. User creates fresh profile → POST /api/players
       New Player created and linked immediately

  Edge cases:
    - Two real people sharing the same name: both resolve to the same shadow profile
      (code cannot distinguish them — admin merge + manual coordination required)
    - No unclaim mechanism exists (admin DB intervention required)
    - No user-facing name change after claiming

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
