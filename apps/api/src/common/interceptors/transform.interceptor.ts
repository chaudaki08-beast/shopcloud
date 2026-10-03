import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseEnvelope<T> {
  success: boolean;
  data: T;
  meta?: any;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseEnvelope<T>> {
    return next.handle().pipe(
      map((res) => {
        if (res === null || res === undefined) {
          return { success: true, data: null as any };
        }

        // If the response is already in { success: true, ... } envelope
        if (typeof res === 'object' && 'success' in res) {
          return res;
        }

        // If the controller returned { data: [...], meta: {...} }
        if (typeof res === 'object' && 'data' in res && 'meta' in res) {
          return {
            success: true,
            data: res.data,
            meta: res.meta,
          };
        }

        return {
          success: true,
          data: res,
        };
      }),
    );
  }
}
