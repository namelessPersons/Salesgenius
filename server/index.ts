import express from 'express';
import dotenv from 'dotenv';
import { AzureKeyCredential, SearchClient } from '@azure/search-documents';
// VectorizedQuery is not typed in the version we're using
type VectorizedQuery = any;
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { OpenAI } from 'openai';

dotenv.config();

const REQUIRED_VARS = [
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_KEY',
  'AZURE_OPENAI_CHAT_DEPLOYMENT',
  'AZURE_OPENAI_EMBEDDING_DEPLOYMENT',
  'AZURE_SEARCH_ENDPOINT',
  'AZURE_SEARCH_KEY',
  'AZURE_SEARCH_INDEX',
  'AZURE_BLOB_CONN_STR',
  'AZURE_BLOB_CONTAINER'
];

const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  throw new Error(`.env is missing: ${missing.join(', ')}`);
}

const client = new OpenAI({
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_CHAT_DEPLOYMENT}`,
  apiKey: process.env.AZURE_OPENAI_KEY
});

class AzureBlobStorageManager {
  private containerClient;
  constructor(connection: string, container: string) {
    const service = BlobServiceClient.fromConnectionString(connection);
    this.containerClient = service.getContainerClient(container);
  }

  async listFiles(prefix = ''): Promise<string[]> {
    const out: string[] = [];
    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      out.push(blob.name);
    }
    return out;
  }

  async readFile(blobName: string): Promise<string> {
    const block = this.containerClient.getBlobClient(blobName);
    const download = await block.download();
    return (await streamToBuffer(download.readableStreamBody)).toString('utf-8');
  }

  getSasUrl(blobName: string): string {
    const sas = generateBlobSASQueryParameters({
      containerName: this.containerClient.containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    }, this.containerClient.credential as any);
    return `${this.containerClient.url}/${blobName}?${sas}`;
  }
}

async function streamToBuffer(readable: NodeJS.ReadableStream | undefined | null): Promise<Buffer> {
  if (!readable) return Buffer.alloc(0);
  const chunks: any[] = [];
  for await (const chunk of readable) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

class AzureAISearcher {
  private searchClient: SearchClient<any>;
  constructor(endpoint: string, key: string, index: string) {
    this.searchClient = new SearchClient<any>(endpoint, index, new AzureKeyCredential(key));
  }

  private async embed(text: string): Promise<number[]> {
    const res = await client.embeddings.create({
      model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT!,
      input: text
    });
    return res.data[0].embedding as unknown as number[];
  }

  async search(query: string, filterExpression?: string, topK: number = 5): Promise<any[]> {
    const results: any = await this.searchClient.search(query, { filter: filterExpression, top: topK });
    const output: any[] = [];
    for await (const r of results.results || results) {
      output.push({
        id: (r as any)["id"],
        path: (r as any)["path"],
        json_path: (r as any)["json_path"],
        md_path: (r as any)["md_path"],
        original_path: (r as any)["original_path"],
        score: (r as any)["@search.score"]
      });
    }
    return output;
  }
}

const blobManager = new AzureBlobStorageManager(process.env.AZURE_BLOB_CONN_STR!, process.env.AZURE_BLOB_CONTAINER!);
const searcher = new AzureAISearcher(process.env.AZURE_SEARCH_ENDPOINT!, process.env.AZURE_SEARCH_KEY!, process.env.AZURE_SEARCH_INDEX!);

async function getMachineList(vehicleType: string, manufacturer?: string, modelKeyword?: string): Promise<any[]> {
  const jsonContent = await blobManager.readFile('output_json/model_list.json');
  const machineJson = JSON.parse(jsonContent);
  const availableVehicleTypes = Object.keys(machineJson);
  const prompt = `ユーザーが指定した建設機械の種類に最も一致するカテゴリを、以下のリストから1つだけ選んでください。\nリスト: ${availableVehicleTypes.join(', ')}\nユーザー入力: "${vehicleType}"\nカテゴリ名のみを返してください。`;

  const resp = await client.chat.completions.create({
    messages: [
      { role: 'system', content: 'あなたは与えられたリストの中から最も適切なカテゴリ名を返すアシスタントです。' },
      { role: 'user', content: prompt }
    ],
    model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT!,
    temperature: 0,
    max_tokens: 50
  });

  const gptVehicleType = (resp.choices[0].message.content ?? '').trim();

  const machineData = machineJson[gptVehicleType] || [];
  const results: any[] = [];
  for (const entry of machineData) {
    const manufacturerMatch = !manufacturer || entry.manufacturer === manufacturer;
    if (!manufacturerMatch) continue;

    if (modelKeyword) {
      const models = (entry.models || []).filter((m: string) => m.toLowerCase().includes(modelKeyword.toLowerCase()));
      if (!models.length) continue;
      results.push({ manufacturer: entry.manufacturer, models });
    } else {
      results.push(entry);
    }
  }
  return results;
}

// very simplified planner/verify loop
async function multiStepChat(query: string): Promise<string> {
  const searchResults = await searcher.search(query);
  const thoughts = JSON.stringify(searchResults, null, 2);
  const resp = await client.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a helpful assistant for construction machine PDFs.' },
      { role: 'user', content: `${query}\n\n${thoughts}` }
    ],
    model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT!
  });
  return resp.choices[0].message.content ?? '';
}

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const reply = await multiStepChat(message);
    res.json({ reply });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
