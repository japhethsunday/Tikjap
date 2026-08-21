import { NextResponse } from "next/server";
import { HttpError } from "./errors";
import { apiError } from "./http";

type Handler<T = unknown> = () => Promise<T> | T;

export async function withHandler<T>(run: Handler<T>): Promise<NextResponse> {
  try {
    const result = await run();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result as T);
  } catch (error) {
    if (error instanceof HttpError) {
      return apiError(error.status, error.code, error.message, error.details);
    }
    console.error("[api]", error);
    return apiError(500, "internal", "Something went wrong on our end. Please try again.");
  }
}