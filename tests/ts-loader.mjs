export async function resolve(specifier,context,nextResolve){
  try{return await nextResolve(specifier,context)}catch(error){
    if(error?.code!=='ERR_MODULE_NOT_FOUND'||(!specifier.startsWith('.')&&!specifier.startsWith('/')))throw error;
    for(const extension of ['.ts','.tsx']){
      try{return await nextResolve(`${specifier}${extension}`,context)}catch(candidateError){if(candidateError?.code!=='ERR_MODULE_NOT_FOUND')throw candidateError}
    }
    throw error;
  }
}
