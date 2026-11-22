/**
 * What fal and Replicate share: each hosts other people's models, publishes
 * every model's input schema, and runs a request as a job that is waited on.
 */

import { fieldsOf, type ModelFields } from "../schema.js";
import type { ImageModel, ProviderApi } from "../types.js";

/** How long a job may take before the wait for it is given up. */
export const JOB_DEADLINE_MS = 5 * 60_000;
const POLL_MS = 1_500;

/** A hosted model with the fields its input takes. */
export interface HostedModel extends ImageModel {
  fields: ModelFields;
}

/** A model and its fields from its input schema, or nothing when it takes no prompt. */
export function hostedModel(
  about: { id: string; name?: string; description?: string },
  input: unknown,
  schemas: unknown,
): HostedModel | undefined {
  const fields = fieldsOf(input, schemas);
  return (
    fields && {
      id: about.id,
      ...(about.name ? { name: about.name } : {}),
      ...(about.description ? { description: about.description } : {}),
      create: !fields.images?.required,
      edit: fields.images !== undefined,
      fields,
    }
  );
}

/**
 * Ask `check` for a job's outcome until it has one. `check` answers
 * `undefined` while the job runs. The job is not cancelled when the wait
 * ends: `label` names it in the error so it can be found.
 */
export async function finished<T>(
  api: ProviderApi,
  label: string,
  check: () => Promise<T | undefined>,
): Promise<T> {
  const deadline = Date.now() + JOB_DEADLINE_MS;
  for (;;) {
    const outcome = await check();
    if (outcome !== undefined) return outcome;
    if (Date.now() >= deadline)
      throw new Error(
        `${label} is still running after ${JOB_DEADLINE_MS / 60_000} minutes. It was not cancelled.`,
      );
    await api.wait(POLL_MS);
  }
}

/** The fields of a model as its host described it, or a refusal when it described none. */
export function modelFields(
  found: ImageModel | undefined,
  id: string,
): ModelFields {
  const fields = (found as HostedModel | undefined)?.fields;
  if (!fields)
    throw new Error(`${id} publishes no input this package can fill.`);
  return fields;
}
