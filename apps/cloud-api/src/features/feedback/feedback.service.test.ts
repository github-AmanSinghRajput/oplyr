import assert from 'node:assert/strict';
import test from 'node:test';
import { FeedbackService } from './feedback.service.js';

class FeedbackRepositoryStub {
  createdInput: Record<string, unknown> | null = null;

  async create(input: Record<string, unknown>) {
    this.createdInput = input;
    return { id: 'feedback-1', ...input };
  }
}

test('FeedbackService normalizes email and trims user feedback content', async () => {
  const repository = new FeedbackRepositoryStub();
  const service = new FeedbackService(repository as never);

  await service.submitFeedback({
    installId: ' install-123 ',
    email: ' Founder@oplyr.com ',
    category: ' bug report ',
    message: '  Voice session failed to start after login.  '
  });

  assert.deepEqual(repository.createdInput, {
    installId: 'install-123',
    email: 'founder@oplyr.com',
    category: 'bug report',
    message: 'Voice session failed to start after login.'
  });
});
