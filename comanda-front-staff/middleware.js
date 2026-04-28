import { NextResponse } from "next/server";

function unauthorizedResponse() {
  return new NextResponse("Auth required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="COMANDA Staff", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function decodeBasicCredentials(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(authorizationHeader.slice(6));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function middleware(request) {
  const basicAuthUser = process.env.STAFF_APP_BASIC_AUTH_USER;
  const basicAuthPassword = process.env.STAFF_APP_BASIC_AUTH_PASSWORD;
  const shouldProtect =
    process.env.NODE_ENV === "production" && basicAuthUser && basicAuthPassword;

  if (!shouldProtect) {
    return NextResponse.next();
  }

  const credentials = decodeBasicCredentials(request.headers.get("authorization"));
  if (
    credentials?.username !== basicAuthUser ||
    credentials?.password !== basicAuthPassword
  ) {
    return unauthorizedResponse();
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: "/:path*",
};
