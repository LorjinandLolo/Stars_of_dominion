// lib/appwrite.ts (server-side client)

export async function getServerClients() {
  // Use dynamic import to prevent node-appwrite from being bundled into the client
  const { Client, Databases, Functions, Query, ID } = await import('node-appwrite');
  
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!endpoint || !project) {
    console.warn('Appwrite configuration is incomplete (PROJECT or PROJECT_ID missing). Skipping client initialization during build-time.');
  }

  const client = new Client();
  
  if (endpoint) client.setEndpoint(endpoint);
  if (project) client.setProject(project);
  if (apiKey) client.setKey(apiKey);

  const db = new Databases(client);
  const fn = new Functions(client);
  return { client, db, fn, ID, Query };
}
