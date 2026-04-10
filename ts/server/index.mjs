// @ts-check

import AWS from "aws-sdk";
import crypto from "crypto";

const s3 = new AWS.S3();

const bucket = "vine-run-0";

export const handler = async (event) => {
  const { method, path } = event.requestContext.http;
  if (method === "GET") {
    const key = path.slice(1);
    if (!key) return response(200, "200 OK");
    console.log("Fetching object", key);
    const object = await s3.getObject({
      Bucket: bucket,
      Key: key,
    }).promise().catch(nullify);
    if (!object?.Body) {
      console.log("404", key);
      return response(404, "404 " + JSON.stringify(key));
    }
    console.log("Fetched", key);
    return response(200, object.Body.toString("utf8"));
  } else if (method === "POST" || method === "PUT") {
    const data = event.body;
    if (typeof data !== "string") return response(400);
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    console.log("Store", hash, "size", data.length);
    let len = 8;
    let key;
    while (true) {
      key = hash.slice(0, len);
      const existing = await s3.headObject({
        Bucket: bucket,
        Key: key,
      }).promise().catch(nullify);
      if (existing && existing.Metadata?.hash === hash) {
        console.log("Existing", key);
        return response(200, JSON.stringify({ key }));
      }
      if (!existing) break;
      len++;
    }
    console.log("Storing", key);

    await s3.putObject({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(data),
      Metadata: { hash },
    }).promise();

    console.log("Saved", key);
    return response(200, JSON.stringify({ key }));
  } else if (method === "OPTIONS") {
    return response(204);
  } else {
    return response(405);
  }

  function response(statusCode, body) {
    const origin = event.headers.origin || "";
    return {
      statusCode,
      body,
      headers: {
        "Access-Control-Allow-Origin": origin.startsWith("http://localhost:") ? origin : "https://vine.run",
        "Access-Control-Allow-Headers": "*",
      },
    };
  }
};

function nullify(error) {
  console.log("ignoring error", error);
  return null
}
