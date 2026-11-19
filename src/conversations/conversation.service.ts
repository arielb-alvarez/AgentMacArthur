import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";
import type { TransactionManager } from "../database/transaction-manager.js";

import type {
  Conversation,
  ConversationMessage,
  CreateConversationInput,
} from "./conversation.types.js";

import type { ConversationRepository } from "./conversation.repository.js";
import type { ConversationAccessService } from "./conversation-access.service.js";

export type StartConversationInput =
  | CreateConversationInput
  | {
      conversationId: string;
    };

export class ConversationService {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly transactionManager: TransactionManager,
    private readonly accessService: ConversationAccessService
  ) {}

  /**
   * Starts a conversation turn.
   *
   * New conversations are created and authorized in the same transaction.
   * Existing conversations are locked before authorization and message insertion.
   */
  async startTurn(
    userId: string,
    input: StartConversationInput,
    message: ConversationMessage
  ): Promise<Conversation> {
    return this.transactionManager.runInTransaction(
      "conversation.startTurn",
      async (client: PoolClient) => {
        let conversation: Conversation | undefined;

        if ("conversationId" in input) {
          conversation = await this.repository.findByIdForUpdate(
            input.conversationId,
            client
          );

          if (!conversation) {
            throw new AppError("Conversation not found.", 404);
          }
        } else {
          const createInput: CreateConversationInput = {
            ...input,
            createdBy: userId,
          };

          conversation = await this.repository.create(
            createInput,
            client
          );
        }

        await this.accessService.assertAccess(
          conversation,
          userId,
          "participate",
          client
        );

        const updatedConversation = await this.repository.addMessage(
          conversation.id,
          message,
          client
        );

        if (!updatedConversation) {
          throw new AppError(
            "Conversation could not be updated.",
            500
          );
        }

        return updatedConversation;
      }
    );
  }

  /**
   * Completes a conversation turn.
   *
   * Permission is checked again after AI generation so revoked access
   * cannot result in an assistant response being persisted.
   */
  async completeTurn(
    conversationId: string,
    userId: string,
    message: ConversationMessage
  ): Promise<Conversation> {
    return this.transactionManager.runInTransaction(
      "conversation.completeTurn",
      async (client: PoolClient) => {
        const conversation =
          await this.repository.findByIdForUpdate(
            conversationId,
            client
          );

        if (!conversation) {
          throw new AppError("Conversation not found.", 404);
        }

        await this.accessService.assertAccess(
          conversation,
          userId,
          "participate",
          client
        );

        const updatedConversation = await this.repository.addMessage(
          conversationId,
          message,
          client
        );

        if (!updatedConversation) {
          throw new AppError(
            "Conversation could not be updated.",
            500
          );
        }

        return updatedConversation;
      }
    );
  }
}
