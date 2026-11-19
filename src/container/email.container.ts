import { env } from "../config/env.js";

import { DevelopmentEmailService } from "../email/development-email.service.js";
import type { EmailService } from "../email/email.service.js";

// A real email provider must be configured before production startup.
const createEmailService = (): EmailService => {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "A production email provider must be configured before email services can start."
    );
  }

  return new DevelopmentEmailService();
};

export const emailService = createEmailService();
