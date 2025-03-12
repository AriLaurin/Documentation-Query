import weaviate from "weaviate-ts-client";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import readline from "readline";

const client = weaviate.client({
  scheme: "http",
  host: "localhost:8080",
});

async function createSchema() {
  await client.schema.deleteAll();

  const schema = {
    class: "DocumentationPage",
    description: "Documentation pages with content and URLs",
    vectorizer: "text2vec-transformers",
    vectorIndexType: "hnsw",
    properties: [
      {
        name: "url",
        dataType: ["string"],
        description: "URL of the documentation page",
      },
      {
        name: "content",
        dataType: ["text"],
        description: "Content of the documentation page",
      },
    ],
  };

  await client.schema.classCreator().withClass(schema).do();
  console.log("✅ Schema created successfully!");
}

async function fetchPageContent(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const textContent = dom.window.document.body.textContent || "";
    return textContent.replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error(`❌ Failed to fetch content from ${url}:`, error);
    return "";
  }
}

async function addDocumentationPages(pages) {
  for (const page of pages) {
    const content = await fetchPageContent(page.url);
    if (!content) continue;

    await client.data
      .creator()
      .withClassName("DocumentationPage")
      .withProperties({ url: page.url, content })
      .do();
  }
  console.log("✅ Documentation pages added successfully!");
}

async function findRelevantDocumentation(userPrompt) {
  const result = await client.graphql
    .get()
    .withClassName("DocumentationPage")
    .withFields("url content _additional {certainty}")
    .withNearText({
      concepts: [userPrompt],
      certainty: 0.7,
    })
    .do();

  const pages = result.data.Get.DocumentationPage;

  console.log(
    "🔍 Searching for relevant documentation based on prompt:",
    userPrompt
  );

  if (!pages.length) {
    console.log("❗ No relevant documentation found for:", userPrompt);
    return;
  }

  console.log(
    `✅ Found ${pages.length} relevant documentation link(s) for prompt: "${userPrompt}"`
  );
  pages.forEach((page, index) => {
    console.log(
      ` ${index + 1}. URL: ${
        page.url
      }\n    Certainty: ${page._additional.certainty.toFixed(2)}\n`
    );
  });
}

async function promptUserInput(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  await createSchema();

  const docs = [
    { url: "https://www.loveandlemons.com/homemade-pizza/" },
    {
      url: "https://www.interaction-design.org/literature/topics/color-theory",
    },
    { url: "https://api-docs.deepseek.com/" },
    {
      url: "https://www.dndbeyond.com/sources/dnd/free-rules/creating-a-character",
    },
    {
      url: "https://stardewvalleywiki.com/Crops",
    },
  ];

  await addDocumentationPages(docs);

  const userPrompt = await promptUserInput(
    "💬 Enter your documentation query: "
  );
  await findRelevantDocumentation(userPrompt);
}

main().catch((error) => {
  console.error("❌ Error in main execution:", error);
});
