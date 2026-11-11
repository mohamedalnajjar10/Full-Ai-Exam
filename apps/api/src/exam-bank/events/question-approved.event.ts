/**
 * Emitted when a staged question is approved and published to the exam bank.
 * Consumed by EmbeddingListener to trigger async vector indexing.
 */
export class QuestionApprovedEvent {
  constructor(public readonly bankQuestionId: string) {}
}
