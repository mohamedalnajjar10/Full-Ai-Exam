/**
 * Compile-time parity between the shared HTTP contract (@ai-exam/types) and
 * the Prisma schema.
 *
 * This file emits no runtime code. If someone adds a value to a Prisma enum
 * without adding it to packages/types/src/enums.ts (or vice versa), `tsc`
 * fails here rather than the two sides silently drifting the way the old
 * hand-copied frontend interfaces did.
 */
import {
  AssessmentAttemptStatus as SharedAssessmentAttemptStatus,
  BloomTaxonomyLevel as SharedBloom,
  ChatMessageRole as SharedChatRole,
  ChatMessageType as SharedChatType,
  DifficultyLevel as SharedDifficulty,
  GeneratedQuestionSourceType as SharedSourceType,
  ParentLinkStatus as SharedParentLinkStatus,
  Role as SharedRole,
  StyleSourceUploadStatus as SharedStyleStatus,
} from '@ai-exam/types';
import {
  AssessmentAttemptStatus,
  BloomTaxonomyLevel,
  ChatMessageRole,
  ChatMessageType,
  DifficultyLevel,
  GeneratedQuestionSourceType,
  ParentLinkStatus,
  Role,
  StyleSourceUploadStatus,
} from '@prisma/client';

/** Resolves to `true` only when A and B are exactly the same union. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Only accepts `true`, so an `Exact` mismatch becomes a compile error. */
type AssertTrue<T extends true> = T;

type _Role = AssertTrue<Exact<`${Role}`, SharedRole>>;
type _ParentLinkStatus = AssertTrue<
  Exact<`${ParentLinkStatus}`, SharedParentLinkStatus>
>;
type _Difficulty = AssertTrue<Exact<`${DifficultyLevel}`, SharedDifficulty>>;
type _Bloom = AssertTrue<Exact<`${BloomTaxonomyLevel}`, SharedBloom>>;
type _SourceType = AssertTrue<
  Exact<`${GeneratedQuestionSourceType}`, SharedSourceType>
>;
type _StyleStatus = AssertTrue<
  Exact<`${StyleSourceUploadStatus}`, SharedStyleStatus>
>;
type _ChatRole = AssertTrue<Exact<`${ChatMessageRole}`, SharedChatRole>>;
type _ChatType = AssertTrue<Exact<`${ChatMessageType}`, SharedChatType>>;
type _AssessmentAttemptStatus = AssertTrue<
  Exact<`${AssessmentAttemptStatus}`, SharedAssessmentAttemptStatus>
>;

// Reference every alias so `noUnusedLocals` stays happy if it is ever enabled.
export type EnumParityChecks = [
  _Role,
  _ParentLinkStatus,
  _Difficulty,
  _Bloom,
  _SourceType,
  _StyleStatus,
  _ChatRole,
  _ChatType,
  _AssessmentAttemptStatus,
];
