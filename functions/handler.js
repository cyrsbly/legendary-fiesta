// import dependencies
const { Configuration, OpenAIApi } = require("openai");
const fs = require("fs");
const path = require("path");

const filepath = path.join(__dirname, "..", "api_key.json");
if (fs.existsSync(filepath)) {
  const apikey = JSON.parse(fs.readFileSync(filepath));
} else {
  console.log(`Unable to locate ${filepath}`);
}
// read API key from config file
const apikey = JSON.parse(fs.readFileSync(filepath, "utf8"));

// configure OpenAI API
const configuration = new Configuration({
  apiKey: apikey.openai,
  username: apikey.username,
});
const openai = new OpenAIApi(configuration);

async function loadNextThreadHistory(api, event, chatHistory, timestamp) {
  const messagesPerPage = 50;
  const maxMessages = 10;

  let messagesLeftToCollect = maxMessages - chatHistory.length;

  while (messagesLeftToCollect > 0) {
    const pageSize = Math.min(messagesPerPage, messagesLeftToCollect);

    const history = await api.getThreadHistory(
      event.threadID,
      pageSize,
      timestamp
    );

    if (history.length === 0) {
      console.log("No messages found in history");
      break;
    }

    const filteredHistory = history.filter(
      (message) => message.type === "message"
    );

    chatHistory.push(...filteredHistory);

    timestamp = filteredHistory[filteredHistory.length - 1].timestamp;

    messagesLeftToCollect -= filteredHistory.length;
  }

  return chatHistory; // return the chatHistory array after it has been modified
}
// export function
module.exports = async (api, event) => {
  try {
    // Initialize an empty chatHistory array
    const chatHistory = [];

    // Call loadNextThreadHistory function to retrieve chat history messages and get the modified chatHistory array
    const modifiedChatHistory = await loadNextThreadHistory(
      api,
      event,
      chatHistory
    );

    // Create an array of message objects to feed into the API as historyMessages
    const historyMessages = modifiedChatHistory.map((message) => ({
      role: message.senderID === "100090602211106" ? "assistant" : "user",
      content: message.body.replace("/ai", ""),
    }));

    // Log the historyMessages array

    // get response from OpenAI API
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-0301",
      max_tokens: 3500,
      messages: [...historyMessages, { role: "user", content: event.body }],
    });

    // get thread info from Facebook Messenger API
    api.getThreadInfo(event.threadID, (err, info) => {
      if (err) {
        console.error(err);
        return;
      }

      // get sender info
      const sender = info.userInfo.find((p) => p.id === event.senderID);
      const senderName = sender.firstName;
      const senderBday = sender.isBirthday;

      // send message based on sender info and OpenAI response
      if (senderBday) {
        api.sendMessage(
          {
            body: `Happy Birthday @${senderName}!`,
            mentions: [{ tag: `@${senderName}`, id: event.senderID }],
          },
          event.threadID
        );
      } else {
        api.sendMessage(
          {
            body: `Hi @${senderName}! ${response.data.choices[0].message.content}`,
            mentions: [{ tag: `@${senderName}`, id: event.senderID }],
          },
          event.threadID
        );
      }
    });
  } catch (error) {
    console.error(error.message);
    api.sendMessage("An error has occured!", event.threadID);
  }
};
