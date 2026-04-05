import { Client, Databases, Account } from 'appwrite';

let client: Client | null = null;
let db: Databases | null = null;
let account: Account | null = null;

export function getBrowserClients() {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

  if (!endpoint || !project) {
    throw new Error('Appwrite configuration missing. Please ensure NEXT_PUBLIC_APPWRITE_ENDPOINT and NEXT_PUBLIC_APPWRITE_PROJECT (or PROJECT_ID) are set in your environment.');
  }

  if (!client) {
    client = new Client()
      .setEndpoint(endpoint)
      .setProject(project);

    db = new Databases(client);
    account = new Account(client);
  }
  return { client: client!, db: db!, account: account! };
}
