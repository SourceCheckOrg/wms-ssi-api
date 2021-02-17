"use strict";
const redis = require("redis");

/**
 * An asynchronous bootstrap function that runs before
 * your application gets started.
 *
 * This gives you an opportunity to set up your data model,
 * run jobs, or perform some special logic.
 *
 * See more details here: https://strapi.io/documentation/developer-docs/latest/concepts/configurations.html#bootstrap
 */

module.exports = async () => {
  process.nextTick(() => {
    // Setup redis client and register it in strapi main object to use it globally
    console.log("Setup redis");
    const redisHost = strapi.config.get("redis.host");
    const redisPort = strapi.config.get("redis.port");
    console.log("Redis url:", `${redisHost}:${redisPort}`);
    strapi.redis = redis.createClient({
      host: strapi.config.get("redis.host"),
      port: strapi.config.get("redis.port"),
    });

    // Setup socket.io server
    console.log("Setup socket.io");
    const frontendHost = strapi.config.get("frontend.host");
    const frontendPort = strapi.config.get("frontend.port");
    const frontendUrl = frontendPort !== 80 ? `${frontendHost}:${frontendPort}` : frontendHost;
    console.log("Frontend url:", frontendUrl);

    var io = require("socket.io")(strapi.server, {
      cors: {
        origin: frontendUrl,
        methods: ["GET", "POST"],
      },
    });
    io.on("connection", async function (socket) {
      console.log(`User connected - socket: `, socket.id);

      // Send message on user connection
      socket.emit("hello", JSON.stringify({ message: "user connected" }));

      // Listen for user diconnect
      socket.on("disconnect", () => {
        console.log("User disconnected");
      });

      // Associate a socket with a client token
      socket.on("client-token-sub", (token) => {
        console.log("client-token-sub", token);
        strapi.redis.set(token, socket.id);
      });
    });

    // Register socket.io inside strapi main object to use it globally
    strapi.io = io;
  });
};
