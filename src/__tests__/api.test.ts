// src/__tests__/api.test.ts
import request from "supertest";
import app from "../index";
import prisma from "../utils/prisma";

// Mock BullMQ so we don't need Redis running for unit tests
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: "mock-job-id" }),
  })),
  Worker: jest.fn(),
}));

// Mock the AI service to prevent real API calls and burning tokens
jest.mock("../services/ai.service", () => ({
  generateContent: jest.fn().mockResolvedValue({
    generated: { twitter: { content: "Mock tweet" } },
    model_used: "mock-model",
    tokens_used: 100,
  }),
}));

describe("Postly API Core Tests", () => {
  let testUserToken = "";
  const testEmail = `testuser_${Date.now()}@example.com`;

  afterAll(async () => {
    // Clean up the DB integration test user
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  // 1. Integration Test hitting the DB (Auth Registration)
  it("should register a new user and save to database", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: testEmail,
      password: "securepassword123",
      name: "Test User",
    });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty("userId");
  });

  // Login to get a token for the rest of the tests
  beforeAll(async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail, password: "password", name: "Test" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "password" });
    testUserToken = res.body.access_token;
  });

  // 2. Auth Middleware (Missing Token)
  it("should reject access to protected routes without a token", async () => {
    const res = await request(app).get("/api/user/profile");
    expect(res.statusCode).toEqual(401);
    expect(res.body.error).toContain("Unauthorized");
  });

  // 3. Auth Middleware (Invalid/Expired Token)
  it("should reject access with an invalid token", async () => {
    const res = await request(app)
      .get("/api/user/profile")
      .set("Authorization", "Bearer invalid_garbage_token");

    expect(res.statusCode).toEqual(401);
    expect(res.body.error).toContain("Unauthorized");
  });

  // 4. Content Generation Input Validation
  it("should validate missing inputs for content generation", async () => {
    const res = await request(app)
      .post("/api/content/generate")
      .set("Authorization", `Bearer ${testUserToken}`)
      .send({
        post_type: "Announcement",
        platforms: ["twitter"],
        // Missing 'idea' on purpose
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain("Idea is required");
  });

  // 5. Queue Job Creation & Status Retrieval
  it("should queue a post and return the paginated status envelope", async () => {
    // First, publish a mock post to populate the DB
    await request(app)
      .post("/api/posts/publish")
      .set("Authorization", `Bearer ${testUserToken}`)
      .send({
        idea: "Test idea",
        post_type: "Thread",
        tone: "Professional",
        language: "en",
        model_used: "openai",
        platforms: { twitter: { content: "test content" } },
      });

    // Then, test the retrieval and strict response envelope
    const res = await request(app)
      .get("/api/posts?page=1&limit=5")
      .set("Authorization", `Bearer ${testUserToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("meta");
    expect(res.body.meta).toHaveProperty("total");
    expect(Array.isArray(res.body.data)).toBeTruthy();
  });
});
