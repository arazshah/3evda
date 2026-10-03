import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

type Route = { method: string; path: string; status?: number; body?: unknown };

/** Minimal fetch fake: the first matching route (method + path) answers; calls are recorded. */
export function fakeApi(routes: Route[]) {
  const calls: { method: string; path: string; search: string; body: unknown }[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const text = request.method === "GET" ? "" : await request.text();
    calls.push({
      method: request.method,
      path,
      search: url.search,
      body: text ? JSON.parse(text) : undefined,
    });
    const index = routes.findIndex((r) => r.method === request.method && r.path === path);
    if (index === -1)
      return new Response(JSON.stringify({ code: "not_found", detail: "not found" }), { status: 404 });
    const [route] = routes.splice(index, 1);
    return new Response(route!.body === undefined ? null : JSON.stringify(route!.body), {
      status: route!.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, calls };
}
