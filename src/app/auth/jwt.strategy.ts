import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
	uuid: string;
	username: string;
	name: string;
	role: string;
	type: 'admin' | 'user';
	tenant_uuid?: string;
	// Offline-station tokens minted by POST /offline/enable and refreshed by
	// POST /offline/refresh. Coexist with normal user tokens on the same
	// AuthGuard('jwt') strategy; the extra fields surface so downstream
	// guards / controllers can enforce offline-specific rules (revoked
	// device, allow-listed endpoints, etc.).
	offline?: boolean;
	device_id?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor() {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: process.env.JWT_SECRET || 'super-secret-change-me',
		});
	}

	async validate(payload: JwtPayload) {
		return {
			uuid: payload.uuid,
			username: payload.username,
			name: payload.name,
			role: payload.role,
			type: payload.type,
			tenant_uuid: payload.tenant_uuid,
			offline: payload.offline === true,
			device_id: payload.device_id,
		};
	}
}
