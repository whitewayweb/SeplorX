CREATE TYPE "public"."agent_status" AS ENUM('pending_approval', 'approved', 'dismissed', 'executed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_type" varchar(100) NOT NULL,
	"status" "agent_status" DEFAULT 'pending_approval' NOT NULL,
	"plan" jsonb NOT NULL,
	"rationale" text,
	"tool_calls" jsonb,
	"resolved_by" integer,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_actions_status_idx" ON "agent_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_actions_agent_type_idx" ON "agent_actions" USING btree ("agent_type");