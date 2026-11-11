/**
 * Emitted when a published exam bank question's text or explanation is updated.
 * Consumed by EmbeddingListener to trigger async vector re-indexing.
 */
export class QuestionUpdatedEvent {
  constructor(public readonly bankQuestionId: string) {}
}
