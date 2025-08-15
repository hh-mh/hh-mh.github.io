import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Main App component
export default function App() {
  const [chatHistory, setChatHistory] = useState([]);
  const [userQuery, setUserQuery] = useState('');
  const [courseContent, setCourseContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // This URL is configured for a single course.
  // You MUST update 'YOUR_COURSE_DIRECTORY' to the correct course folder name
  // for each agent you create (e.g., 'algdisk', 'tekber', or 'analyst').
  const courseContentUrl = 'https://raw.githubusercontent.com/hh-mh/hh-mh.github.io/main/teaching/YOUR_COURSE_DIRECTORY/index.html';

  // State variable for exponential backoff retry
  const [retryDelay, setRetryDelay] = useState(1000); // Start with 1 second delay

  // Function to parse HTML content and extract text
  const parseHtmlForText = (html) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      // Extract innerText from the body, which should contain most of the visible content
      // without script tags, style tags, etc.
      return doc.body.innerText;
    } catch (e) {
      console.error("Failed to parse HTML:", e);
      return ""; // Return an empty string if parsing fails
    }
  };

  // Function to handle fetching the course material from GitHub Pages
  useEffect(() => {
    async function fetchCourseContent() {
      try {
        const response = await fetch(courseContentUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const htmlText = await response.text();
        const plainText = parseHtmlForText(htmlText);
        setCourseContent(plainText);
        
        // Add an initial message to the chat
        setChatHistory([{
          role: 'system',
          text: "Hi there! I'm your AI assistant for this course. Please ask me any questions you have about the course material."
        }]);
      } catch (e) {
        console.error('Failed to fetch course content:', e);
        setError('Could not load course material. Please check the URL.');
      }
    }
    fetchCourseContent();
  }, []); // Empty dependency array means this runs once on component mount

  // Function to call the Gemini API
  const callGeminiApi = async (prompt, delay) => {
    try {
      const payload = {
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ],
        // You can use other models here if you have an API key.
        // const apiKey = "";
      };
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 429) {
        // Handle rate limiting with exponential backoff
        throw new Error('Rate limit exceeded. Retrying...');
      }

      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        return result.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Unexpected API response structure or no content.');
      }
    } catch (e) {
      if (e.message.includes('Rate limit exceeded') && delay < 16000) { // Max retry delay of 16 seconds
        console.warn(`Retrying in ${delay}ms...`);
        setRetryDelay(delay * 2);
        await new Promise(res => setTimeout(res, delay));
        return callGeminiApi(prompt, delay * 2); // Recursive call with increased delay
      } else {
        throw e;
      }
    }
  };

  // Function to handle user query submission
  const handleQuery = async (e) => {
    e.preventDefault();
    if (!userQuery.trim() || isLoading) return;

    // Add user's message to chat history
    const newUserMessage = { role: 'user', text: userQuery };
    setChatHistory(prev => [...prev, newUserMessage]);
    setUserQuery('');
    setIsLoading(true);
    setError(null);

    // Construct the prompt for the LLM
    // This is a simple RAG (Retrieval-Augmented Generation) approach.
    // We provide the full context of the course material for the LLM to "refer" to.
    const prompt = `
      You are an AI assistant for a university course. Your purpose is to answer student questions based on the provided course material.

      **Course Material (for your reference):**
      ---
      ${courseContent}
      ---

      **Important Rules:**
      - Only answer questions based on the course material provided.
      - If a question cannot be answered from the material, state that you do not have enough information and can only answer questions related to the provided text.
      - Be concise and helpful.
      - Maintain a friendly and academic tone.

      **Student's Question:**
      ${userQuery}
    `;

    try {
      const assistantResponse = await callGeminiApi(prompt, retryDelay);
      setChatHistory(prev => [...prev, { role: 'assistant', text: assistantResponse }]);
      setRetryDelay(1000); // Reset retry delay on success
    } catch (e) {
      console.error('Error fetching response:', e);
      setError('An error occurred. Please try again later.');
      // Add error message to chat history
      setChatHistory(prev => [...prev, { role: 'assistant', text: "I'm sorry, I was unable to provide a response at this time. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans">
      <div className="container mx-auto p-4 flex flex-col h-full max-w-2xl">
        <header className="text-center py-4">
          <h1 className="text-3xl font-bold text-gray-800">Course AI Assistant</h1>
          <p className="text-gray-500 mt-1">Ask me anything about the course material!</p>
        </header>

        <div className="flex-1 overflow-y-auto p-4 bg-white rounded-lg shadow-md mb-4">
          {chatHistory.length > 0 ? (
            chatHistory.map((msg, index) => (
              <div
                key={index}
                className={`p-3 my-2 rounded-lg max-w-[85%] ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white self-end ml-auto'
                    : 'bg-gray-200 text-gray-800 self-start mr-auto'
                }`}
              >
                <p className="text-sm">{msg.text}</p>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 mt-10">
              {isLoading ? 'Loading course content...' : 'Chat history will appear here.'}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form onSubmit={handleQuery} className="flex p-2 bg-white rounded-lg shadow-md">
          <input
            type="text"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Type your question here..."
            className="flex-1 p-3 rounded-l-lg border-2 border-r-0 border-gray-300 focus:outline-none focus:border-blue-500 transition-colors"
            disabled={isLoading || !courseContent}
          />
          <button
            type="submit"
            className="bg-blue-500 text-white p-3 rounded-r-lg hover:bg-blue-600 transition-colors duration-200 disabled:bg-blue-300 disabled:cursor-not-allowed"
            disabled={isLoading || !courseContent}
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white mx-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Send'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
