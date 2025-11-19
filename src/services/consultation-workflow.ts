import type { Env } from '../types';
import { processConsultation } from './consultation-agent';

/**
 * Consultation Workflow Service
 * Defines the multi-step workflow for processing consultation requests
 */

export interface ConsultationWorkflowParams {
  session_id: string;
  prompt: string;
}

/**
 * Main workflow entry point
 * This would integrate with Cloudflare Workflows in production
 */
export async function runConsultationWorkflow(
  env: Env,
  params: ConsultationWorkflowParams
): Promise<void> {
  const { session_id, prompt } = params;

  try {
    // Execute the consultation processing
    await processConsultation(env, session_id, prompt);
  } catch (error) {
    console.error('Consultation workflow error:', error);
    throw error;
  }
}

/**
 * Queue consumer handler for consultation tasks
 * Processes messages from CONSULTATION_QUEUE
 */
export async function handleConsultationQueueMessage(
  batch: MessageBatch<any>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const { session_id, prompt } = message.body;

      console.log(`Processing consultation for session: ${session_id}`);

      // Run the workflow
      await runConsultationWorkflow(env, { session_id, prompt });

      // Acknowledge the message
      message.ack();
    } catch (error) {
      console.error('Error processing consultation message:', error);
      // Retry will happen automatically if not acked
      message.retry();
    }
  }
}
