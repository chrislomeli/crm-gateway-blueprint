import { logger } from '@platform/core';
import {ContactInfo} from "../../types/webhook.types";
import {IntentVote, SignalScore} from "../../types/intent.types";


export function validateContactRequiredFields(
    contactInfo: ContactInfo,
): IntentVote {
  // Check required fields first
  if (!contactInfo?._source) {
    logger.debug({
      reason: 'Missing required field: _source',
      user_id: 0,
    }, 'ContactValidation Decision: FAIL');
    return {
      user_id: 0,
      stats: ['Missing required field: _source'],
      score: SignalScore.FAIL,
    };
  }

  const validation = analyzeContact(contactInfo);

  // Log the decision
  logger.debug({
    score: validation.score,
    reason: validation.messages[0],
    user_id: validation.ownerId,
  }, 'ContactValidation Decision');

  return {
    user_id: validation.ownerId,
    stats: validation.messages,
    score: validation.score,
  };
}

function analyzeContact(contactInfo:  ContactInfo) {  // OR just use 'any' for now
  const source = contactInfo._source;
  if (!source) {
    return {
      ownerId: 0,
      messages: ['Bad _source field on contact'],
      score: SignalScore.FAIL,
    };
  }

  // Extract what we have
  const ownerId = parseOwnerId(source.acmeownerid);
  const hasPhone = hasValidPhone(source.phone164);

  // Apply business rules with clear reasoning
  if (!ownerId) {
    return {
      ownerId: 0,
      messages: ['Waiting: No valid acme owner assigned'],
      score: SignalScore.WAIT,
    };
  }

  if (!hasPhone) {
    return {
      ownerId,
      messages: ['Skipping: No phone number to process'],
      score: SignalScore.NOOP,
    };
  }

  return {
    ownerId,
    messages: ['Ready: Valid owner and phone'],
    score: SignalScore.FORWARD,
  };
}

function parseOwnerId(value: unknown): number {
  const id = Number(value);
  return (!isNaN(id) && id > 0) ? id : 0;
}

function hasValidPhone(phones: any[] | undefined): boolean {  // Use whatever type phone164 actually is
  return (phones || []).some(p => !!p?.phone?.toString().trim());
}