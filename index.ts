import dotenv from "dotenv";
dotenv.config();
import { createServer } from "https";
import { readFileSync } from "fs";
import WebSocket from "ws"
import { v4 as uuidv4 } from 'uuid';
import axios from "axios"

let server: any = {}
if (process.env.NODE_ENV !== "local")
  server = createServer({
    cert: readFileSync(process.env.CERT_PATH),
    key: readFileSync(process.env.KEY_PATH)
  });

const wss = new WebSocket.Server(
  process.env.NODE_ENV === "local"
    ? { port: 4000 }
    : { server }
)

const axiosRequest = axios.create({
  baseURL: process.env.API_URL,
  headers: { "Content-Type": "application/json" },
})

// create link between userId and his ws
let usersIdWs: any = {}

wss.on("connection", function connection(ws) {
  // @ts-ignore
  ws["id"] = uuidv4()
  let firstTime = true
  let userToken = ""

  ws.on("open", function open() {
    console.log("open")
  });

  ws.on("message", async function (data: any) {
    data = JSON.parse(data)
    console.log(data)

    if (firstTime) {
      // token
      firstTime = false

      axiosRequest({
        method: "get",
        url: "/users/who-am-i",
        headers: {
          Authorization: `Bearer ${data.token}`,
        }
      })
        .then(res => {
          userToken = data.token
          usersIdWs[res.data._id] = ws
        })
        .catch((err) => {
          console.error(err)
          ws.close()
        })
    }
    else if (data.operation === "createConversation") {
      // users, title, message, ?createdBy
      axiosRequest({
        method: "post",
        url: "/conversations",
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        data: {
          users: data.users, // [_id, _id, _id]
          message: data.message, // messages text
          createdBy: data.createdBy
        }
      })
        .then(res => {
          data.users.forEach((user: string) => {
            if (usersIdWs[user])
              usersIdWs[user].send(JSON.stringify(
                res.data.message
                  ? {
                    operation: "addMessage",
                    data: {
                      sid: uuidv4(),
                      ...res.data
                    }
                  }
                  : {
                    operation: "conversationCreated",
                    data: {
                      sid: uuidv4(),
                      ...res.data
                    }
                  })
              )

            // send a notification
            if (usersIdWs[user] !== ws && data.createdBy !== user)
              axiosRequest({
                method: "post",
                url: "/send-notification",
                headers: {
                  Authorization: `Bearer ${userToken}`,
                },
                data: {
                  users: [user], // [_id]
                  notification: {
                    title: data.title,
                    body: data.message, // messages text
                  },
                  data: {
                    notificationType: "NEW_MESSAGE",
                    resourceId: res.data._id.toString() // conversation id
                  }
                }
              })
                .then(res => { })
                .catch(console.error)
          })
        })
        .catch(console.error)
    }
    else if (data.operation === "addMessage") {
      // conversationId, text
      axiosRequest({
        method: "post",
        url: `/conversations/${data.conversationId}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        data: {
          text: data.text
        }
      })
        .then(res => {
          res.data.users.forEach((user: string) => {
            if (usersIdWs[user])
              usersIdWs[user].send(JSON.stringify(
                {
                  operation: "addMessage",
                  data: {
                    sid: uuidv4(),
                    ...res.data
                  }
                })
              )

            // send a notification
            if (usersIdWs[user] !== ws)
              axiosRequest({
                method: "post",
                url: "/send-notification",
                headers: {
                  Authorization: `Bearer ${userToken}`,
                },
                data: {
                  users: [user], // [_id]
                  notification: {
                    body: data.text, // messages text
                  },
                  data: {
                    notificationType: "NEW_MESSAGE",
                    resourceId: data.conversationId.toString() // conversation id
                  }
                }
              })
                .then(res => { })
                .catch(console.error)
          })
        })
        .catch(console.error)
    }
    else if (data.operation === "removeMessage") {
      // conversationId, messageId
      axiosRequest({
        method: "delete",
        url: `/conversations/${data.conversationId}/messages/${data.messageId}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        }
      })
        .then(res => {
          res.data.users.forEach((user: string) => {
            if (usersIdWs[user])
              usersIdWs[user].send(JSON.stringify(
                {
                  operation: "removeMessage",
                  data: {
                    sid: uuidv4(),
                    messageId: data.messageId
                  }
                })
              )

            // send a notification
            if (usersIdWs[user] !== ws)
              axiosRequest({
                method: "post",
                url: "/send-notification",
                headers: {
                  Authorization: `Bearer ${userToken}`,
                },
                data: {
                  users: [user], // [_id]
                  notification: {
                    title: "Generation",
                    body: "Message retiré",
                  },
                  data: {
                    notificationType: "REMOVE_MESSAGE",
                    resourceId: data.conversationId.toString() // conversation id
                  }
                }
              })
                .then(res => { })
                .catch(console.error)
          })
        })
        .catch(console.error)
    }
    else if (data.operation === "readMessages") {
      // conversationId, userId
      axiosRequest({
        method: "patch",
        url: `/conversations/${data.conversationId}/read`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        }
      })
        .then(res => {
          res.data.users.forEach((user: string) => {
            if (usersIdWs[user])
              usersIdWs[user].send(JSON.stringify(
                {
                  operation: "messagesReaded",
                  data: {
                    sid: uuidv4(),
                    user: data.userId,
                    conversation: data.conversationId
                  }
                })
              )
          })
        })
        .catch(console.error)
    }
  });

  ws.on("close", () => {
    userToken = undefined
    for (const id in usersIdWs) {
      if (usersIdWs[id] === ws) {
        delete usersIdWs.key
        break
      }
    }
  });
})

if (process.env.NODE_ENV !== "local")
  server.listen(4000);