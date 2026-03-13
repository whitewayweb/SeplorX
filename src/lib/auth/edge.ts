export async function getSession(headers: Headers, baseUrl: string) {
    try {
        const response = await fetch(new URL("/api/auth/get-session", baseUrl).toString(), {
            headers: {
                cookie: headers.get("cookie") || "",
            },
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (err) {
        console.error("Auth edge fetch error", err);
        return null;
    }
}
