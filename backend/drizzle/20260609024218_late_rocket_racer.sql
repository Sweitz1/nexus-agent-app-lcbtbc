ALTER TABLE "logs" DROP CONSTRAINT "logs_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "memory" DROP CONSTRAINT "memory_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;