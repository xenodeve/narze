import { type AdminRole, isAtLeast } from "@narze/shared";
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Authenticator, type Identity } from "../auth/authenticator";
import { AdminRoles } from "./admin-roles";

const NEEDS = "narze:admin-role";
/** The route needs a Developer, not just an Admin (spec #97: only a Developer changes the whitelist). */
export const DeveloperOnly = () => SetMetadata(NEEDS, "developer" satisfies AdminRole);

/** What AdminGuard leaves on the request for the handler. */
export interface AdminRequest {
  headers: { authorization?: string };
  admin?: { identity: Identity; role: AdminRole };
}

/**
 * Every admin route goes through this one guard (#110, spec #122): signed out is 401, signed in but
 * not on the whitelist (or not a Developer where one is needed) is 403. Identity comes from the
 * verified token only.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(AdminRoles) private readonly roles: AdminRoles,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const identity = await this.auth.require(request.headers.authorization);
    const role = await this.roles.roleOf(identity.discordId);
    const needed =
      this.reflector.getAllAndOverride<AdminRole | undefined>(NEEDS, [context.getHandler(), context.getClass()]) ??
      "admin";
    if (!isAtLeast(role, needed)) throw new ForbiddenException("not allowed");
    request.admin = { identity, role: role as AdminRole };
    return true;
  }
}
