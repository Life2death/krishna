use tauri_plugin_sql::{Migration, MigrationKind};

/// Returns all database migrations
pub fn migrations() -> Vec<Migration> {
    vec![
        // Migration 1: Create system_prompts table with indexes and triggers
        Migration {
            version: 1,
            description: "create_system_prompts_table",
            sql: include_str!("migrations/system-prompts.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 2: Create chat history tables (conversations and messages)
        Migration {
            version: 2,
            description: "create_chat_history_tables",
            sql: include_str!("migrations/chat-history.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 3: Create interview profiles table
        Migration {
            version: 3,
            description: "create_interview_profiles_table",
            sql: include_str!("migrations/interview-profiles.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 4: Add resume_file_name and documents_json to interview_profiles
        Migration {
            version: 4,
            description: "add_resume_file_and_documents_to_profiles",
            sql: include_str!("migrations/interview-profiles-v2.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 5: Add first_name and persona_text to interview_profiles
        Migration {
            version: 5,
            description: "add_first_name_and_persona_to_profiles",
            sql: include_str!("migrations/interview-profiles-v3.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 7: Create learned_actions table for Phase 3 self-learning
        Migration {
            version: 7,
            description: "create_learned_actions_table",
            sql: include_str!("migrations/learned-actions-v2.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 8: Create skills table for Phase 4 task recipes
        Migration {
            version: 8,
            description: "create_skills_table",
            sql: include_str!("migrations/skills.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 9: Create memories table for Phase 5 personal memory
        Migration {
            version: 9,
            description: "create_memories_table",
            sql: include_str!("migrations/memories.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 10: Create audit_log table for Phase 5 trust layer
        Migration {
            version: 10,
            description: "create_audit_log_table",
            sql: include_str!("migrations/audit-log.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 11: Create reminders table for Phase 5 proactivity
        Migration {
            version: 11,
            description: "create_reminders_table",
            sql: include_str!("migrations/reminders.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 12: Create command_log table for command insights
        Migration {
            version: 12,
            description: "create_command_log_table",
            sql: include_str!("migrations/command-log.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 13: Sync infrastructure — sync_tombstones, sync_state,
        // updated_at columns, memory_embeddings, backfill
        Migration {
            version: 13,
            description: "add_sync_infrastructure",
            sql: include_str!("migrations/sync-v1.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 14: Voice-ID Continuous Learning — voiceprint_samples gallery
        // and voiceprint_state calibration row
        Migration {
            version: 14,
            description: "add_voiceprint_gallery_and_state",
            sql: include_str!("migrations/voice-id-v1.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 15: Fix TEXT updated_at → INTEGER for sync correctness
        Migration {
            version: 15,
            description: "fix_text_updated_at_for_sync",
            sql: include_str!("migrations/sync-v2.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
