import {
  databaseRpc,
  generateActivationToken,
  hashActivationToken,
  hashSecret,
  json,
  normalizeLicenseKey,
  publicError,
  readJsonBody,
  rejectDisallowedOrigin,
} from "../_shared/license.ts";

type ActivationResult = {
  valid: boolean;
  status: string;
  activation_limit: number;
  active_activations: number;
  expires_at: string | null;
  message: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(request, { ok: true });
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  const originError = rejectDisallowedOrigin(request);
  if (originError) return originError;

  try {
    const body = await readJsonBody(request);
    const installationId =
      typeof body.installation_id === "string" ? body.installation_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId)) {
      return json(request, { error: "A valid installation identifier is required." }, 400);
    }

    if (typeof body.license_key === "string" && body.license_key.trim()) {
      const normalizedKey = normalizeLicenseKey(body.license_key);
      const activationToken = generateActivationToken();
      const result = await databaseRpc<ActivationResult[]>("activate_paid_license", {
        p_key_hash: await hashSecret(normalizedKey),
        p_installation_id: installationId,
        p_token_hash: await hashActivationToken(activationToken),
        p_label:
          typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null,
      });
      const activation = result?.[0];
      if (!activation?.valid) {
        return json(
          request,
          {
            valid: false,
            status: activation?.status || "invalid",
            message: activation?.message || "This licence could not be activated.",
          },
          403,
        );
      }
      return json(request, {
        ...activation,
        activation_token: activationToken,
      });
    }

    if (typeof body.activation_token === "string" && body.activation_token.trim()) {
      const result = await databaseRpc<ActivationResult[]>("validate_paid_activation", {
        p_token_hash: await hashActivationToken(body.activation_token.trim()),
        p_installation_id: installationId,
      });
      const activation = result?.[0];
      return json(
        request,
        activation || {
          valid: false,
          status: "invalid",
          message: "This activation is not valid.",
        },
        activation?.valid ? 200 : 403,
      );
    }

    return json(request, { error: "Enter a licence key or activation token." }, 400);
  } catch (error) {
    if (error instanceof Error && /complete EventFlow licence key/.test(error.message)) {
      return json(request, { error: error.message }, 400);
    }
    return json(request, { error: publicError(error) }, 500);
  }
});
