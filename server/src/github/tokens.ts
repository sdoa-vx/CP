import fs from "fs";
import jwt from "jsonwebtoken";

const APP_ID = process.env.GITHUB_APP_ID!;
const PRIVATE_KEY_PATH = process.env.GITHUB_PRIVATE_KEY_PATH!;

export async function createAppJWT() {
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now - 60,
      exp: now + 600,
      iss: APP_ID,
    },
    privateKey,
    { algorithm: "RS256" }
  );
}

export async function createInstallationToken(installationId: number) {
  const jwt = await createAppJWT();

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to create installation token: ${res.status}`);
  }

  const data = await res.json();
  return data.token as string;
}
