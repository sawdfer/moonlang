/** Result of a form Server Action, rendered by <ActionForm>. */
export type FormState = {
  /** Message key under `classes.errors`. */
  error?: string;
  /** Pre-formatted schedule warnings; the form asks for confirmation (RN-003). */
  issues?: string[];
  /** Message key under `classes.success`. */
  success?: string;
} | null;
