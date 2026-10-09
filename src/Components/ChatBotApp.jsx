import React, { useEffect, useRef, useState } from 'react'
import './ChatBotApp.css'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { GoogleGenAI } from '@google/genai'

const ChatBotApp = ({ onGoBack, chats, setChats, activeChat, setActiveChat, onNewChat }) => {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showChatList, setShowChatList] = useState(false)
  const chatEndRef = useRef(null)

  // Single effect to manage active chat synchronization
  useEffect(() => {
    if (!activeChat) {
      setMessages([])
      return
    }
    const storedMessages = JSON.parse(localStorage.getItem(activeChat))
    if (storedMessages) {
      setMessages(storedMessages)
    } else {
      const activeChatObj = chats.find((chat) => chat.id === activeChat)
      setMessages(activeChatObj ? activeChatObj.messages : [])
    }
  }, [activeChat, chats])

  const handleEmojiSelect = (emoji) => {
    setInputValue((prevInput) => prevInput + emoji.native)
    setShowEmojiPicker(false)
  }

  const handleInputChange = (e) => {
    setInputValue(e.target.value)
  }

  const sendMessage = async () => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput) return

    const newMessage = {
      type: 'prompt',
      text: trimmedInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setInputValue('')
    setShowEmojiPicker(false)

    if (!activeChat) {
      onNewChat(trimmedInput)
      return
    }

    const updatedMessages = [...messages, newMessage]
    setMessages(updatedMessages)
    localStorage.setItem(activeChat, JSON.stringify(updatedMessages))

    // Update chats using functional state updater to avoid stale state closures
    setChats((prevChats) => {
      const updated = prevChats.map((chat) =>
        chat.id === activeChat ? { ...chat, messages: updatedMessages } : chat
      )
      localStorage.setItem('chats', JSON.stringify(updated))
      return updated
    })

    setIsTyping(true)

    try {
      const apiMessages = [
        { role: 'system', content: 'You are a helpful, knowledgeable, and polite AI assistant.' },
        ...updatedMessages.map((msg) => ({
          role: msg.type === 'prompt' ? 'user' : 'assistant',
          content: msg.text,
        })),
      ]

      let chatResponse = ''

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: apiMessages,
            model: 'gemini-3.8-flash',
          }),
        })

        if (response.ok) {
          const responseData = await response.json()
          chatResponse = responseData.message || responseData.choices?.[0]?.message?.content?.trim()
        } else {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || `Server responded with status ${response.status}`)
        }
      } catch (endpointError) {
        console.warn('API route failed, trying direct Gemini client fallback...', endpointError)
        
        let clientApiKey = (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '').trim()
        if (clientApiKey.endsWith(';')) {
          clientApiKey = clientApiKey.slice(0, -1).trim()
        }

        if (clientApiKey) {
          const ai = new GoogleGenAI({
            apiKey: clientApiKey,
          })

          const contents = updatedMessages.map((msg) => ({
            role: msg.type === 'prompt' ? 'user' : 'model',
            parts: [{ text: msg.text }],
          }))

          const result = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents,
            config: {
              systemInstruction: 'You are a helpful, knowledgeable, and polite AI assistant.',
            },
          })

          chatResponse = result.text || 'No response generated.'
        } else {
          throw endpointError
        }
      }

      if (!chatResponse) {
        chatResponse = 'No response generated.'
      }

      const newResponse = {
        type: 'response',
        text: chatResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prevMessages) => {
        const withResponse = [...prevMessages, newResponse]
        localStorage.setItem(activeChat, JSON.stringify(withResponse))
        return withResponse
      })

      setChats((prevChats) => {
        const updated = prevChats.map((chat) =>
          chat.id === activeChat
            ? { ...chat, messages: [...(chat.messages || []), newResponse] }
            : chat
        )
        localStorage.setItem('chats', JSON.stringify(updated))
        return updated
      })
    } catch (error) {
      console.error('Failed to fetch AI response:', error)
      const errorResponse = {
        type: 'response',
        text: `⚠️ Error: ${error.message || 'Unable to connect to AI service. Please check your API key and connection.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prevMessages) => {
        const withResponse = [...prevMessages, errorResponse]
        localStorage.setItem(activeChat, JSON.stringify(withResponse))
        return withResponse
      })

      setChats((prevChats) => {
        const updated = prevChats.map((chat) =>
          chat.id === activeChat
            ? { ...chat, messages: [...(chat.messages || []), errorResponse] }
            : chat
        )
        localStorage.setItem('chats', JSON.stringify(updated))
        return updated
      })
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleSelectChat = (id) => {
    setActiveChat(id)
    setShowChatList(false)
  }

  const handleDeleteChat = (id) => {
    const updatedChats = chats.filter((chat) => chat.id !== id)
    setChats(updatedChats)
    localStorage.setItem('chats', JSON.stringify(updatedChats))
    localStorage.removeItem(id)

    if (id === activeChat) {
      const newActiveChat = updatedChats.length > 0 ? updatedChats[0].id : null
      setActiveChat(newActiveChat)
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="chat-app">
      <div className={`chat-list ${showChatList ? 'show' : ''}`}>
        <div className="chat-list-header">
          <h2>Chat List</h2>
          <i className="bx bx-edit-alt new-chat" onClick={() => onNewChat()}></i>
          <i className="bx bx-x-circle close-list" onClick={() => setShowChatList(false)}></i>
        </div>
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-list-item ${chat.id === activeChat ? 'active' : ''}`}
            onClick={() => handleSelectChat(chat.id)}
          >
            <h4>{chat.displayId || chat.id}</h4>
            <i
              className="bx bx-x-circle"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteChat(chat.id)
              }}
            ></i>
          </div>
        ))}
      </div>

      <div className="chat-window">
        <div className="chat-title">
          <h3>Chat with AI</h3>
          <i className="bx bx-menu" onClick={() => setShowChatList(true)}></i>
          <i className="bx bx-arrow-back arrow" onClick={onGoBack}></i>
        </div>

        <div className="chat">
          {messages.map((msg, index) => (
            <div key={index} className={msg.type === 'prompt' ? 'prompt' : 'response'}>
              {msg.text} <span>{msg.timestamp}</span>
            </div>
          ))}
          {isTyping && <div className="typing">Typing...</div>}
          <div ref={chatEndRef}></div>
        </div>

        <form className="msg-form" onSubmit={(e) => e.preventDefault()}>
          <i
            className="fa-solid fa-face-smile emoji"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
          ></i>
          {showEmojiPicker && (
            <div className="picker">
              <Picker data={data} onEmojiSelect={handleEmojiSelect} />
            </div>
          )}
          <input
            type="text"
            className="msg-input"
            placeholder="Type a message..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowEmojiPicker(false)}
          />
          <i className="fa-solid fa-paper-plane" onClick={sendMessage}></i>
        </form>
      </div>
    </div>
  )
}

export default ChatBotApp