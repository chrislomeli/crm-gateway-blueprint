import {MessageStatus, StatusStore} from "../interfaces/subscriber";

/**
 * In-memory implementation of StatusStore for tracking message status
 */
export class InMemoryStatusStore implements StatusStore {
    private statusMap: Map<string, MessageStatus> = new Map();

    async getStatus(messageId: string): Promise<MessageStatus | null> {
        return this.statusMap.get(messageId) || null;
    }

    async setStatus(messageId: string, status: MessageStatus): Promise<void> {
        this.statusMap.set(messageId, status);
    }

    async clearStatus(messageId: string): Promise<void> {
        this.statusMap.delete(messageId);
    }
}
