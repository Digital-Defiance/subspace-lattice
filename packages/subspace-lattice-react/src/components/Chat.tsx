import React, { useState } from 'react';
import { IChatMessage } from '@subspace-lattice/core';
import './Chat.scss';

interface ChatProps {
  messages?: IChatMessage[];
  onSendMessage: (text: string) => void;
  /** Spectators watch chat but cannot send (Warp gallery style). */
  readOnly?: boolean;
}

export const Chat: React.FC<ChatProps> = ({
  messages,
  onSendMessage,
  readOnly = false,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  return (
    <div className="subspace-chat" data-testid="chat">
      <div className="chat-messages">
        {(messages ?? []).map((msg) => (
          <div
            key={msg.id}
            className={`chat-message ${msg.isSystemMessage ? 'system' : ''}`}
          >
            {!msg.isSystemMessage && (
              <span className="sender">{msg.senderId}: </span>
            )}
            <span className="text">{msg.text}</span>
            <span className="timestamp">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
      {readOnly ? (
        <p className="chat-readonly" data-testid="chat-readonly">
          Spectating — chat is read-only
        </p>
      ) : (
        <form className="chat-input-form" onSubmit={handleSend}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Send a message..."
            className="chat-input"
          />
          <button type="submit" className="chat-send-btn">
            Send
          </button>
        </form>
      )}
    </div>
  );
};
