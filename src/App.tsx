import React, { useState } from 'react';
import axios from 'axios';

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);

  const sendMessage = async () => {
    if (!input) return;
    const userMessage = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    setInput('');
    try {
      const res = await axios.post('/api/chat', { message: input });
      const reply = res.data.reply;
      setMessages(m => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Sales Genius</h1>
      <div style={{ marginBottom: '1rem' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '0.5rem 0' }}>
            <strong>{m.role}: </strong>{m.content}
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Enter the question..."
        style={{ width: '70%', marginRight: '0.5rem' }}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
};

export default App;
