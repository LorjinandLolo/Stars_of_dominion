// lib/appwrite.ts (server-side client)

export async function getServerClients() {
  // Use dynamic import to prevent node-appwrite from being bundled into the client
  const { Client, Databases, Functions, Query, ID } = await import('node-appwrite');
  
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)
    .setKey(process.env.APPWRITE_API_KEY!);

  const db = new Databases(client);
  const fn = new Functions(client);
  return { client, db, fn, ID, Query };
}
