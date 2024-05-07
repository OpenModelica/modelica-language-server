import Parser from "web-tree-sitter";
import * as fs from "node:fs";
import * as path from "node:path";

import * as TreeSitterUtil from "../util/tree-sitter";
import {
  ReferenceKind,
  ResolvedReference,
  UnresolvedAbsoluteReference,
  UnresolvedReference,
  UnresolvedRelativeReference,
} from "./reference";
import logger from "../util/logger";
import { ModelicaProject, ModelicaLibrary, ModelicaDocument } from "../project";

export type Resolution = "declaration" | "definition";

/**
 * Locates the declaration or definition of a symbol reference.
 *
 * @param project the project
 * @param reference a reference
 * @param resolution the kind of symbol to search for
 */
export default function resolveReference(
  project: ModelicaProject,
  reference: UnresolvedReference,
  resolution: Resolution,
): ResolvedReference | null {
  logger.debug(`Resolving ${resolution} ${reference}`);

  if (resolution === "definition") {
    throw new Error("Resolving definitions not yet supported!");
  }

  if (reference instanceof UnresolvedAbsoluteReference) {
    return resolveAbsoluteReference(project, reference);
  }

  for (const ref of getAbsoluteReferenceCandidates(reference)) {
    const resolved = resolveAbsoluteReference(project, ref);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

/**
 * Converts a relative reference to an absolute reference.
 *
 * @param reference a relative reference to a symbol declaration/definition
 * @returns an absolute reference to that symbol, or `null` if no such symbol exists.
 */
function* getAbsoluteReferenceCandidates(
  reference: UnresolvedRelativeReference,
): Generator<UnresolvedAbsoluteReference, void, void> {
  logger.debug(`Checking candidates for ${reference}`);

  for (const local of findReferenceInDocument(reference)) {
    if (local instanceof UnresolvedAbsoluteReference) {
      logger.debug(`Found ${local}`);
      yield local;
      continue;
    }

    const relativeReference = local ?? reference;

    const ancestors: string[] = [];
    let currentNode: Parser.SyntaxNode | null = relativeReference.node;
    while (currentNode) {
      if (currentNode.type === "class_definition") {
        const identifier = TreeSitterUtil.getDeclaredIdentifiers(currentNode).at(0);
        if (identifier) {
          ancestors.unshift(identifier);
        }
      }

      currentNode = currentNode.parent;
    }

    if (relativeReference.node.type === "class_definition") {
      ancestors.pop();
    }

    logger.debug(`Found ${relativeReference} with ancestors: [${ancestors}]`);

    const classPath = [...relativeReference.document.within, ...ancestors];
    while (true) {
      yield new UnresolvedAbsoluteReference(
        [...classPath, ...relativeReference.symbols],
        relativeReference.kind,
      );
      if (classPath.length === 0) {
        break;
      }
      classPath.pop();
    }
  }

  logger.debug(`Didn't find ${reference}`);
}

/**
 * Locates the declaration/definition of a reference in its document, or finds a suitable absolute reference.
 *
 * @param reference a reference to a local in which the `document` and `node` properties reference
 *     the usage of the symbol.
 * @returns either
 *     (1) a relative reference in which the `document` and `node` properties reference
 *         the symbol's declaration/definition,
 *     (2) an absolute reference
 *     (3) `undefined` (not in the document)
 */
function* findReferenceInDocument(
  reference: UnresolvedRelativeReference,
): Generator<UnresolvedRelativeReference | UnresolvedAbsoluteReference | undefined, void, void> {
  const maybeClass = reference.kind === "class" || reference.kind === undefined;
  const maybeVariable = reference.kind === "variable" || reference.kind === undefined;

  if (maybeClass) {
    // logger.debug("findReferenceInDocument: Checking if this node is a class...");
    if (
      TreeSitterUtil.isDefinition(reference.node) &&
      TreeSitterUtil.hasIdentifier(reference.node, reference.symbols[0])
    ) {
      yield new UnresolvedRelativeReference(
        reference.document,
        reference.node,
        reference.symbols,
        "class",
      );
      return;
    }

    // logger.debug("findReferenceInDocument: Checking for child class...");
    const classDecl = reference.node.children.find(
      (child) =>
        TreeSitterUtil.isDefinition(child) &&
        TreeSitterUtil.hasIdentifier(child, reference.symbols[0]),
    );
    if (classDecl) {
      logger.debug("Found local class");
      yield new UnresolvedRelativeReference(
        reference.document,
        classDecl,
        reference.symbols,
        "class",
      );
      return;
    }
  }

  if (maybeVariable) {
    // logger.debug("findReferenceInDocument: Checking for child variable...");
    const varDecl = reference.node.children.find(
      (child) =>
        TreeSitterUtil.isVariableDeclaration(child) &&
        TreeSitterUtil.hasIdentifier(child, reference.symbols[0]),
    );
    if (varDecl) {
      logger.debug("Found local variable");
      yield new UnresolvedRelativeReference(
        reference.document,
        varDecl,
        reference.symbols,
        "variable",
      );
      return;
    }
  }

  // logger.debug("findReferenceInDocument: Checking for declarations in class...");
  const declInClass = findDeclarationInClass(
    reference.document,
    reference.node,
    reference.symbols,
    reference.kind,
  );
  if (declInClass) {
    yield declInClass;
    return;
  }

  const importClauses = reference.node.parent?.children.filter(
    (child) => child.type === "import_clause",
  );
  if (importClauses && importClauses.length > 0) {
    // logger.debug("findReferenceInDocument: Checking imports...");
    for (const importClause of importClauses) {
      const { importCandidate, wildcard } = resolveImportClause(reference.symbols, importClause);
      if (importCandidate) {
        // logger.debug("findReferenceInDocument: found import!");

        if (wildcard) {
          yield importCandidate;
        } else {
          yield importCandidate;
          return;
        }
      }
    }
  }

  if (reference.node.parent) {
    // logger.debug("findReferenceInDocument: Checking parent node...");
    yield* findReferenceInDocument(
      new UnresolvedRelativeReference(
        reference.document,
        reference.node.parent,
        reference.symbols,
        reference.kind,
      ),
    );
    return;
  }

  logger.debug(`Not found in document. May be a global? ${reference}`);
  yield undefined;
  return;
}

function findDeclarationInClass(
  document: ModelicaDocument,
  classNode: Parser.SyntaxNode,
  symbols: string[],
  referenceKind: ReferenceKind | undefined,
): (UnresolvedRelativeReference & { kind: ReferenceKind }) | undefined {
  if (classNode.type !== "class_definition") {
    return undefined;
  }

  // logger.debug(
  //   `findDeclarationInClass: Checking for declaration ${symbols.join(".")} ` +
  //     `in class: ${TreeSitterUtil.getDeclaredIdentifiers(classNode)}`,
  // );

  const elements = classNode
    .childForFieldName("classSpecifier")
    ?.children?.filter(TreeSitterUtil.isElementList)
    ?.flatMap((element_list) => element_list.namedChildren)
    ?.map((element) => [element, TreeSitterUtil.getDeclaredIdentifiers(element)] as const);

  if (!elements) {
    logger.debug("Didn't find declaration in class");
    return undefined;
  }

  const namedElement = elements.find(
    ([element, idents]) => element.type === "named_element" && idents.includes(symbols[0]),
  );
  if (namedElement) {
    logger.debug(`Resolved ${symbols[0]} to field: ${namedElement[1]}`);

    const classDef = namedElement[0].childForFieldName("classDefinition");
    if (classDef) {
      return new UnresolvedRelativeReference(
        document,
        classDef,
        symbols,
        "class",
      ) as UnresolvedRelativeReference & { kind: ReferenceKind };
    }

    const componentDef = namedElement[0].childForFieldName("componentClause")!;

    // TODO: this handles named_elements but what if it's an import clause?
    return new UnresolvedRelativeReference(
      document,
      componentDef,
      symbols,
      "variable",
    ) as UnresolvedRelativeReference & { kind: ReferenceKind };
  }

  // only check superclasses if we know we're not looking for a class
  if (referenceKind !== "class") {
    const extendsClauses = elements
      .map(([element, _idents]) => element)
      .filter((element) => element.type === "extends_clause");
    for (const extendsClause of extendsClauses) {
      const superclassType = TreeSitterUtil.getTypeSpecifier(extendsClause);
      const unresolvedSuperclass = superclassType.isGlobal
        ? new UnresolvedAbsoluteReference(superclassType.symbols, "class")
        : new UnresolvedRelativeReference(document, extendsClause, superclassType.symbols, "class");

      logger.debug(
        `Resolving superclass ${unresolvedSuperclass} (of ${
          TreeSitterUtil.getDeclaredIdentifiers(classNode)[0]
        })`,
      );

      // TODO: support "definition" resolution
      const superclass = resolveReference(document.project, unresolvedSuperclass, "declaration");
      if (!superclass) {
        logger.warn(`Could not find superclass ${unresolvedSuperclass}`);
        continue;
      }

      logger.debug(`Checking superclass ${superclass}`);
      const decl = findDeclarationInClass(
        superclass.document,
        superclass.node,
        symbols,
        "variable",
      );
      if (decl) {
        logger.debug(`Declaration ${decl} found in superclass ${superclass}`);
        return decl;
      }
    }
  }

  return undefined;
}

interface ResolveImportClauseResult {
  /**
   * The resolved import candidate, or `undefined` if none was found.
   */
  importCandidate?: UnresolvedAbsoluteReference;
  /**
   * `true` if this was a wildcard import, and we are not sure if this import even exists.
   * `false` if this was not a wildcard import.
   */
  wildcard: boolean;
}

/**
 * Given an import clause and a potentially-imported symbol, returns an
 * unresolved reference to check.
 *
 * @param symbols a symbol that may have been imported
 * @param importClause an import clause
 * @returns the resolved import
 */
function resolveImportClause(
  symbols: string[],
  importClause: Parser.SyntaxNode,
): ResolveImportClauseResult {
  // imports are always relative according to the grammar
  const importPath = TreeSitterUtil.getTypeSpecifier(
    importClause.childForFieldName("name")!,
  ).symbols;

  // wildcard import: import a.b.*;
  const isWildcard = importClause.childForFieldName("wildcard") != null;
  if (isWildcard) {
    const importCandidate = new UnresolvedAbsoluteReference([...importPath, ...symbols]);
    logger.debug(`Candidate: ${importCandidate} (from import ${importPath.join(".")}.*)`);

    // TODO: this should probably not resolve the reference fully, then immediately
    // discard it so it can do so again.
    return { importCandidate, wildcard: true };
  }

  // import alias: import z = a.b.c;
  // TODO: Determine if import aliases should be counted as "declarations".
  //       If so, then we should stop here for decls when symbols.length == 1.
  const alias = importClause.childForFieldName("alias")?.text;
  if (alias && alias === symbols[0]) {
    const importCandidate = new UnresolvedAbsoluteReference([...importPath, ...symbols.slice(1)]);
    logger.debug(`Candidate: ${importCandidate} (from import ${alias} = ${importPath.join(".")})`);

    return { importCandidate, wildcard: false };
  }

  // multi-import: import a.b.{c, d, e};
  const childImports = importClause
    .childForFieldName("imports")
    ?.namedChildren?.filter((node) => node.type === "IDENT")
    ?.map((node) => node.text);

  if (childImports?.some((name) => name === symbols[0])) {
    const importCandidate = new UnresolvedAbsoluteReference([...importPath, ...symbols]);
    const importString = `import ${importPath.join(".")}.{ ${childImports.join(", ")} }`;
    logger.debug(`Candidate: ${importCandidate} (from ${importString})`);

    return { importCandidate, wildcard: false };
  }

  // normal import: import a.b.c;
  if (importPath.at(-1) === symbols[0]) {
    const importCandidate = new UnresolvedAbsoluteReference([...importPath, ...symbols.slice(1)]);
    logger.debug(`Candidate: ${importCandidate} (from import ${importPath.join(".")})`);

    return { importCandidate, wildcard: false };
  }

  return { wildcard: false };
}

/**
 * Locates the declaration/definition of an absolute symbol reference.
 *
 * @param reference an absolute reference
 * @returns a resolved reference, or `null` if no such symbol exists
 */
function resolveAbsoluteReference(
  project: ModelicaProject,
  reference: UnresolvedAbsoluteReference,
): ResolvedReference | null {
  if (!(reference instanceof UnresolvedAbsoluteReference)) {
    throw new Error(`Reference is not an UnresolvedAbsoluteReference: ${reference}`);
  }

  logger.debug(`Resolving ${reference}`);

  const library = project.libraries.find((lib) => lib.name === reference.symbols[0]);
  if (library == null) {
    logger.debug(`Couldn't find library: ${reference.symbols[0]}`);
    return null;
  }

  let alreadyResolved: ResolvedReference | null = null;
  for (let i = 0; i < reference.symbols.length; i++) {
    alreadyResolved = resolveNext(library, reference.symbols[i], alreadyResolved);
    if (alreadyResolved == null) {
      return null;
    }

    // If we're not done with the reference chain, we need to make sure that we know
    // the type of the variable in order to check its child variables
    if (
      i < reference.symbols.length - 1 &&
      TreeSitterUtil.isVariableDeclaration(alreadyResolved.node)
    ) {
      const classRef = variableRefToClassRef(alreadyResolved);
      if (classRef == null) {
        logger.debug(`Failed to find type of var ${alreadyResolved}`);
        return null;
      }

      alreadyResolved = classRef;
    }
  }

  logger.debug(`Resolved symbol ${alreadyResolved}`);

  return alreadyResolved;
}

/**
 * Performs a single iteration of the resolution algorithm.
 *
 * @param nextSymbol the next symbol to resolve
 * @param parentReference a resolved reference (to a class)
 * @returns the next resolved reference
 */
function resolveNext(
  library: ModelicaLibrary,
  nextSymbol: string,
  parentReference: ResolvedReference | null,
): ResolvedReference | null {
  // If at the root level, find the root package
  if (!parentReference) {
    const documentPath = path.join(library.path, "package.mo");
    const [document, packageClass] = getPackageClassFromFilePath(
      library,
      documentPath,
      nextSymbol,
    );
    if (!document || !packageClass) {
      logger.debug(`Couldn't find package class: ${nextSymbol} in ${documentPath}`);
      return null;
    }

    return new ResolvedReference(document, packageClass, [nextSymbol], "class");
  }

  const dirName = path.dirname(parentReference.document.path);
  const potentialPaths = [
    path.join(dirName, `${nextSymbol}.mo`),
    path.join(dirName, `${nextSymbol}/package.mo`),
  ];

  for (const documentPath of potentialPaths) {
    if (!fs.existsSync(documentPath)) {
      continue;
    }

    const [document, packageClass] = getPackageClassFromFilePath(library, documentPath, nextSymbol);
    if (!document || !packageClass) {
      logger.debug(`Couldn't find package class: ${nextSymbol} in ${documentPath}`);
      return null;
    }

    return new ResolvedReference(
      document,
      packageClass,
      [...parentReference.symbols, nextSymbol],
      "class",
    );
  }

  // TODO: The `kind` parameter here should be `undefined` unless
  //       `resolveReference` was called with kind = "class" by
  //       the superclass handling section in findDeclarationInClass.
  //       ...or something like that
  // As it is now, we don't know if `child` is a class or variable. We can't use
  // `undefined` to indicate this because this results in infinite recursion. 
  // This issue causes us to be unable to look up variables declared in a superclass 
  // of a member variable. A redesign might be necessary to resolve this.
  const child = findDeclarationInClass(
    parentReference.document,
    parentReference.node,
    [nextSymbol],
    parentReference.kind,
  );
  if (child) {
    return new ResolvedReference(
      child.document,
      child.node,
      [...parentReference.symbols, nextSymbol],
      child.kind,
    );
  }

  logger.debug(`Couldn't find: .${parentReference.symbols.join(".")}.${nextSymbol}`);

  return null;
}

function getPackageClassFromFilePath(
  library: ModelicaLibrary,
  filePath: string,
  symbol: string,
): [ModelicaDocument | undefined, Parser.SyntaxNode | undefined] {
  const document = library.documents.get(filePath);
  if (!document) {
    logger.debug(`getPackageClassFromFilePath: Couldn't find document ${filePath}`);
    return [undefined, undefined];
  }

  const node = TreeSitterUtil.findFirst(
    document.tree.rootNode,
    (child) => child.type === "class_definition" && TreeSitterUtil.hasIdentifier(child, symbol),
  );
  if (!node) {
    logger.debug(
      `getPackageClassFromFilePath: Couldn't find package class node ${symbol} in ${filePath}`,
    );
    return [document, undefined];
  }

  return [document, node];
}

/**
 * Finds the type of a variable declaration and returns a reference to that type.
 *
 * @param varRef a reference to a variable declaration/definition
 * @returns a reference to the class definition, or `null` if the type is not a class (e.g. a builtin like `Real`)
 */
function variableRefToClassRef(varRef: ResolvedReference): ResolvedReference | null {
  const type = TreeSitterUtil.getTypeSpecifier(varRef.node);

  const typeRef = type.isGlobal
    ? new UnresolvedAbsoluteReference(type.symbols, "class")
    : new UnresolvedRelativeReference(varRef.document, varRef.node, type.symbols, "class");

  return resolveReference(varRef.document.project, typeRef, "declaration");
}
