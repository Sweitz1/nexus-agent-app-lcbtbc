import { describe, test, expect } from "bun:test";
import { api, authenticatedApi, signUpTestUser, expectStatus, connectWebSocket, connectAuthenticatedWebSocket, waitForMessage } from "./helpers";

describe("API Integration Tests", () => {
  let authToken: string;
  let userId: string;

  // ===== Auth Setup =====
  test("Sign up test user", async () => {
    const { token, user } = await signUpTestUser();
    authToken = token;
    userId = user.id;
    expect(authToken).toBeDefined();
    expect(userId).toBeDefined();
  });

  // ===== Providers Tests =====
  describe("Providers", () => {
    let providerId: string;

    test("Create provider", async () => {
      const res = await authenticatedApi("/api/providers", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Provider",
          provider_type: "openai",
          api_key: "test-key-123",
          default_model: "gpt-4",
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      providerId = data.id;
      expect(providerId).toBeDefined();
    });

    test("Get all providers", async () => {
      const res = await authenticatedApi("/api/providers", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("Update provider", async () => {
      const res = await authenticatedApi(`/api/providers/${providerId}`, authToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Provider",
          enabled: true,
        }),
      });
      await expectStatus(res, 200);
    });

    test("Test provider connection", async () => {
      const res = await authenticatedApi(`/api/providers/${providerId}/test`, authToken, {
        method: "POST",
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.ok).toBeDefined();
    });

    test("Test provider with invalid ID", async () => {
      const res = await authenticatedApi(
        "/api/providers/00000000-0000-0000-0000-000000000000/test",
        authToken,
        { method: "POST" }
      );
      await expectStatus(res, 404);
    });

    test("Delete provider", async () => {
      const res = await authenticatedApi(`/api/providers/${providerId}`, authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 204);
    });

    test("Get deleted provider returns 404", async () => {
      const res = await authenticatedApi(`/api/providers/${providerId}`, authToken);
      await expectStatus(res, 404);
    });

    test("Update non-existent provider", async () => {
      const res = await authenticatedApi(
        "/api/providers/00000000-0000-0000-0000-000000000000",
        authToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test" }),
        }
      );
      await expectStatus(res, 404);
    });

    test("Create provider with missing required field", async () => {
      const res = await authenticatedApi("/api/providers", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Incomplete Provider",
        }),
      });
      await expectStatus(res, 400);
    });
  });

  // ===== Custom APIs Tests =====
  describe("Custom APIs", () => {
    let customApiId: string;

    test("Create custom API", async () => {
      const res = await authenticatedApi("/api/custom-apis", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test API",
          base_url: "https://api.example.com",
          auth_type: "none",
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      customApiId = data.id;
      expect(customApiId).toBeDefined();
    });

    test("Get all custom APIs", async () => {
      const res = await authenticatedApi("/api/custom-apis", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("Update custom API", async () => {
      const res = await authenticatedApi(`/api/custom-apis/${customApiId}`, authToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated API",
        }),
      });
      await expectStatus(res, 200);
    });

    test("Test custom API connection", async () => {
      const res = await authenticatedApi(`/api/custom-apis/${customApiId}/test`, authToken, {
        method: "POST",
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.ok).toBeDefined();
    });

    test("Test custom API with invalid ID", async () => {
      const res = await authenticatedApi(
        "/api/custom-apis/00000000-0000-0000-0000-000000000000/test",
        authToken,
        { method: "POST" }
      );
      await expectStatus(res, 403, 404);
    });

    // ===== Custom API Endpoints =====
    describe("Endpoints", () => {
      let endpointId: string;

      test("Create endpoint", async () => {
        const res = await authenticatedApi(
          `/api/custom-apis/${customApiId}/endpoints`,
          authToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "GET Users",
              method: "GET",
              path: "/users",
              description: "Get all users",
            }),
          }
        );
        await expectStatus(res, 201);
        const data = await res.json();
        endpointId = data.id;
        expect(endpointId).toBeDefined();
      });

      test("Update endpoint", async () => {
        const res = await authenticatedApi(
          `/api/custom-apis/${customApiId}/endpoints/${endpointId}`,
          authToken,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: "Updated description",
            }),
          }
        );
        await expectStatus(res, 200);
      });

      test("Delete endpoint", async () => {
        const res = await authenticatedApi(
          `/api/custom-apis/${customApiId}/endpoints/${endpointId}`,
          authToken,
          { method: "DELETE" }
        );
        await expectStatus(res, 204);
      });

      test("Delete endpoint with invalid API ID", async () => {
        const invalidApiId = "00000000-0000-0000-0000-000000000000";
        const res = await authenticatedApi(
          `/api/custom-apis/${invalidApiId}/endpoints/${endpointId}`,
          authToken,
          { method: "DELETE" }
        );
        await expectStatus(res, 403, 404);
      });

      test("Create endpoint with missing required field", async () => {
        const res = await authenticatedApi(
          `/api/custom-apis/${customApiId}/endpoints`,
          authToken,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Incomplete Endpoint",
            }),
          }
        );
        await expectStatus(res, 400);
      });
    });

    test("Update non-existent custom API", async () => {
      const res = await authenticatedApi(
        "/api/custom-apis/00000000-0000-0000-0000-000000000000",
        authToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test" }),
        }
      );
      await expectStatus(res, 404);
    });

    test("Delete custom API", async () => {
      const res = await authenticatedApi(`/api/custom-apis/${customApiId}`, authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 204);
    });

    test("Get deleted custom API returns 404", async () => {
      const res = await authenticatedApi(`/api/custom-apis/${customApiId}`, authToken);
      await expectStatus(res, 404);
    });

    test("Create custom API with missing required field", async () => {
      const res = await authenticatedApi("/api/custom-apis", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Incomplete API",
        }),
      });
      await expectStatus(res, 400);
    });
  });

  // ===== Tasks Tests =====
  describe("Tasks", () => {
    let taskId: string;

    test("Create task", async () => {
      const res = await authenticatedApi("/api/tasks", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_goal: "Test task goal",
          priority: 1,
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      taskId = data.id;
      expect(taskId).toBeDefined();
    });

    test("Get task details", async () => {
      const res = await authenticatedApi(`/api/tasks/${taskId}`, authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.id).toBe(taskId);
    });

    test("List tasks", async () => {
      const res = await authenticatedApi("/api/tasks", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.tasks).toBeDefined();
      expect(Array.isArray(data.tasks)).toBe(true);
    });

    test("List tasks with pagination", async () => {
      const res = await authenticatedApi("/api/tasks?limit=10&offset=0", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.limit).toBe(10);
      expect(data.offset).toBe(0);
    });

    test("List tasks with status filter", async () => {
      const res = await authenticatedApi("/api/tasks?status=pending", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data.tasks)).toBe(true);
    });

    test("Get non-existent task", async () => {
      const res = await authenticatedApi(
        "/api/tasks/00000000-0000-0000-0000-000000000000",
        authToken
      );
      await expectStatus(res, 404);
    });

    test("Cancel task", async () => {
      const res = await authenticatedApi(`/api/tasks/${taskId}/cancel`, authToken, {
        method: "POST",
      });
      await expectStatus(res, 200);
    });

    test("Cancel non-existent task", async () => {
      const res = await authenticatedApi(
        "/api/tasks/00000000-0000-0000-0000-000000000000/cancel",
        authToken,
        { method: "POST" }
      );
      await expectStatus(res, 404);
    });

    test("Delete task", async () => {
      const res = await authenticatedApi(`/api/tasks/${taskId}`, authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 204);
    });

    test("Get deleted task returns 404", async () => {
      const res = await authenticatedApi(`/api/tasks/${taskId}`, authToken);
      await expectStatus(res, 404);
    });

    test("Create task with missing required field", async () => {
      const res = await authenticatedApi("/api/tasks", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await expectStatus(res, 400);
    });

    test("Approve task step", async () => {
      const createRes = await authenticatedApi("/api/tasks", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_goal: "Task with approval",
          requires_user_approval: true,
        }),
      });
      const taskData = await createRes.json();
      const newTaskId = taskData.id;

      const res = await authenticatedApi(`/api/tasks/${newTaskId}/approve`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step_id: "00000000-0000-0000-0000-000000000000",
          approved: true,
        }),
      });
      await expectStatus(res, 200, 404);
    });
  });

  // ===== Permissions Tests =====
  describe("Permissions", () => {
    test("Get user permissions", async () => {
      const res = await authenticatedApi("/api/permissions", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.user_id).toBeDefined();
      expect(typeof data.allow_file_read).toBe("boolean");
    });

    test("Update user permissions", async () => {
      const res = await authenticatedApi("/api/permissions", authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allow_file_read: true,
          allow_file_write: false,
        }),
      });
      await expectStatus(res, 200);
    });
  });

  // ===== Memory Tests =====
  describe("Memory", () => {
    let memoryId: string;

    test("Create memory entry", async () => {
      const res = await authenticatedApi("/api/memory", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memory_type: "short_term",
          content: "Test memory",
          importance_score: 0.8,
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      memoryId = data.id;
      expect(memoryId).toBeDefined();
    });

    test("Search memory entries", async () => {
      const res = await authenticatedApi("/api/memory?q=test", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("Search memory with type filter", async () => {
      const res = await authenticatedApi("/api/memory?type=short_term", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("Search memory with limit", async () => {
      const res = await authenticatedApi("/api/memory?limit=10", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("Delete memory entry", async () => {
      const res = await authenticatedApi(`/api/memory/${memoryId}`, authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 204);
    });

    test("Delete non-existent memory entry", async () => {
      const res = await authenticatedApi(
        "/api/memory/00000000-0000-0000-0000-000000000000",
        authToken,
        { method: "DELETE" }
      );
      await expectStatus(res, 404);
    });

    test("Create memory with missing required field", async () => {
      const res = await authenticatedApi("/api/memory", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memory_type: "short_term",
        }),
      });
      await expectStatus(res, 400);
    });
  });

  // ===== GitHub Tests =====
  describe("GitHub", () => {
    test("Get GitHub status", async () => {
      const res = await authenticatedApi("/api/github/status", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(typeof data.connected).toBe("boolean");
    });

    test("Connect GitHub with invalid PAT", async () => {
      const res = await authenticatedApi("/api/github/connect", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pat: "invalid-token-12345",
        }),
      });
      await expectStatus(res, 400);
    });

    test("Disconnect GitHub", async () => {
      const res = await authenticatedApi("/api/github/disconnect", authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    test("Clone repository with invalid repo", async () => {
      const res = await authenticatedApi("/api/github/clone", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: "nonexistent",
          repo: "nonexistent-repo-12345",
        }),
      });
      await expectStatus(res, 200, 400);
    });

    test("Get GitHub file with invalid path", async () => {
      const res = await authenticatedApi(
        "/api/github/file?owner=torvalds&repo=linux&path=nonexistent.txt",
        authToken
      );
      await expectStatus(res, 200, 400);
    });
  });

  // ===== Logs Tests =====
  describe("Logs", () => {
    test("Get user logs", async () => {
      const res = await authenticatedApi("/api/logs", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("Get logs with level filter", async () => {
      const res = await authenticatedApi("/api/logs?level=error", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("Get logs with limit", async () => {
      const res = await authenticatedApi("/api/logs?limit=50", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ===== Runtime Tests =====
  describe("Runtime", () => {
    test("Get runtime status", async () => {
      const res = await authenticatedApi("/api/runtime/status", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.ok).toBeDefined();
      expect(typeof data.version).toBe("string");
      expect(Array.isArray(data.tools_available)).toBe(true);
    });
  });
});
