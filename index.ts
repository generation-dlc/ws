import dotenv from "dotenv";
dotenv.config();
import WebSocket from "ws"
const wss = new WebSocket.Server({ port: 4000 })
import uuid from "uuid"
import axios from "axios"

const axiosRequest = axios.create({
  baseURL: process.env.API_URL,
  headers: { "Content-Type": "application/json" },
})

// create link between userId and his ws
let usersIdWs: any = {}

wss.on("connection", function connection(ws) {
  // @ts-ignore
  ws["id"] = uuid.v4()
  let firstTime = true
  let userToken = ""

  // ws.on("open", function open() {
  //     console.log("open")
  // });

  ws.on("message", async function (data: any) {
    data = JSON.parse(data)
    console.log(data)

    if (firstTime) {
      // token
      firstTime = false
      userToken = data.token

      axiosRequest({
        method: "delete",
        url: "/who-am-i",
        headers: {
          Authorization: `Bearer ${userToken}`,
        }
      })
        .then(res => usersIdWs[res.data._id] = ws)
        .catch((err) => {
          console.error(err)
          ws.close()
        })
    }
    else if (data.operation === "createConversation") {
      // users, message
      axiosRequest({
        method: "post",
        url: "/conversations",
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
        data: {
          users: data.users, // [_id, _id, _id]
          message: data.message // messages text
        }
      })
        .then(res => {
          data.users.forEach((user: string) => {
            if (usersIdWs[user])
              usersIdWs[user].send(JSON.stringify(
                {
                  operation: "conversationCreated",
                  data: res.data
                })
              )
            else {
              // TO DO send notification
              console.log("send notification")
            }
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
                    text: data.text
                  }
                })
              )
            else {
              // TO DO send notification
              console.log("send notification")
            }
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
                    messageId: data.messageId
                  }
                })
              )
            else {
              // TO DO send notification
              console.log("send notification")
            }
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