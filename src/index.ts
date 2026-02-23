/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Default system prompt
const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes
		if (url.pathname === "/api/chat") {
			// Handle POST requests for chat
			if (request.method === "POST") {
				return handleChatRequest(request, env);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405 });
		}

		// Groq API Proxy - OpenAI compatible endpoint
		if (url.pathname.startsWith("/openai/v1/")) {
			return handleGroqProxy(request, env);
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		// Parse JSON request body
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		// Add system prompt if not present
		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		const stream = await env.AI.run(
			MODEL_ID,
			{
				messages,
				max_tokens: 1024,
				stream: true,
			},
			{
				// Uncomment to use AI Gateway
				// gateway: {
				//   id: "YOUR_GATEWAY_ID", // Replace with your AI Gateway ID
				//   skipCache: false,      // Set to true to bypass cache
				//   cacheTtl: 3600,        // Cache time-to-live in seconds
				// },
			},
		);

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}

/**
 * Handles Groq API proxy requests (OpenAI compatible)
 */
async function handleGroqProxy(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const GROQ_API_HOST = "api.groq.com";
		const oldUrl = new URL(request.url);

		// Construct new URL pointing to Groq API
		const newUrl = new URL(request.url);
		newUrl.hostname = GROQ_API_HOST;
		newUrl.protocol = "https:";
		newUrl.port = "";

		// Build headers
		const headers = new Headers(request.headers);
		headers.set("host", GROQ_API_HOST);

		// Add authorization header if API key is configured
		if (env.GROQ_API_KEY) {
			headers.set("authorization", `Bearer ${env.GROQ_API_KEY}`);
		}

		const modifiedRequest = new Request(newUrl, {
			method: request.method,
			headers: headers,
			body: request.body,
		});

		return await fetch(modifiedRequest);
	} catch (error) {
		console.error("Error proxying Groq request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to proxy request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
