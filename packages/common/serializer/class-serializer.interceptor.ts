import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Inject, Injectable, Optional } from '../decorators/core';
import { StreamableFile } from '../file-stream';
import { CallHandler, ExecutionContext, NestInterceptor } from '../interfaces';
import { ClassTransformOptions } from '../interfaces/external/class-transform-options.interface';
import { TransformerPackage } from '../interfaces/external/transformer-package.interface';
import { loadPackage } from '../utils/load-package.util';
import { isObject } from '../utils/shared.utils';
import { CLASS_SERIALIZER_OPTIONS } from './class-serializer.constants';

let classTransformer: TransformerPackage = {} as any;

export interface PlainLiteralObject {
  [key: string]: any;
}

// NOTE (external)
// We need to deduplicate them here due to the circular dependency
// between core and common packages
const REFLECTOR = 'Reflector';

export interface ClassSerializerInterceptorOptions
  extends ClassTransformOptions {
  transformerPackage?: TransformerPackage;
}

@Injectable()
export class ClassSerializerInterceptor implements NestInterceptor {
  constructor(
    @Inject(REFLECTOR) protected readonly reflector: any,
    @Optional()
    protected readonly defaultOptions: ClassSerializerInterceptorOptions = {},
  ) {
    classTransformer =
      defaultOptions?.transformerPackage ??
      loadPackage('class-transformer', 'ClassSerializerInterceptor', () =>
        require('class-transformer'),
      );

    if (!defaultOptions?.transformerPackage) {
      require('class-transformer');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const contextOptions = this.getContextOptions(context);
    const options = {
      ...this.defaultOptions,
      ...contextOptions,
    };
    return next
      .handle()
      .pipe(
        map((res: PlainLiteralObject | Array<PlainLiteralObject>) =>
          this.serialize(res, options),
        ),
      );
  }

  /**
   * Serializes responses that are non-null objects nor streamable files.
   */
  serialize(
    response: PlainLiteralObject | Array<PlainLiteralObject>,
    options: ClassTransformOptions,
  ): PlainLiteralObject | Array<PlainLiteralObject> {
    if (!isObject(response) || response instanceof StreamableFile) {
      return response;
    }

    return Array.isArray(response)
      ? response.map(item => this.transformToPlain(item, options))
      : this.transformToPlain(response, options);
  }

  transformToPlain(
    plainOrClass: any,
    options: ClassTransformOptions,
  ): PlainLiteralObject {
    return plainOrClass
      ? classTransformer.classToPlain(plainOrClass, options)
      : plainOrClass;
  }

  protected getContextOptions(
    context: ExecutionContext,
  ): ClassTransformOptions | undefined {
    return this.reflector.getAllAndOverride(CLASS_SERIALIZER_OPTIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
