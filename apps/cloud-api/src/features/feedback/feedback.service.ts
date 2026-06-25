import { FeedbackRepository } from './feedback.repository.js';

export class FeedbackService {
  constructor(private readonly repository = new FeedbackRepository()) {}

  submitFeedback(input: { installId?: string; email?: string; category: string; message: string }) {
    return this.repository.create({
      installId: input.installId?.trim(),
      email: input.email?.trim().toLowerCase(),
      category: input.category.trim(),
      message: input.message.trim()
    });
  }
}
