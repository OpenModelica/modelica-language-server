import Parser from "web-tree-sitter";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import * as TreeSitterUtil from "../util/tree-sitter";
import {
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

  const absoluteReference = reference.isAbsolute() ? reference : absolutize(reference);
  if (absoluteReference === null) {
    return null;
  } else if (absoluteReference instanceof ResolvedReference) {
    return absoluteReference;
  }

  return resolveAbsoluteReference(project, absoluteReference);
}

/**
 * Converts a relative reference to an absolute reference.
 *
 * @param reference a relative reference to a symbol declaration/definition
 * @returns an absolute reference to that symbol, or `null` if no such symbol exists.
 */
function absolutize(reference: UnresolvedRelativeReference): UnresolvedAbsoluteReference | null {
  logger.debug(`Absolutize: ${reference}`);
  const local = findReferenceInDocument(reference);
  if (local === null) {
    logger.debug(`Didn't find symbol ${reference}`);
    return null;
  } else if (local instanceof UnresolvedAbsoluteReference) {
    logger.debug(`Found absolute reference ${local}`);
    return local;
  }

  const ancestors: string[] = [];
  let currentNode = local.node;
  while (currentNode.parent) {
    if (currentNode.type === "class_definition") {
      const identifier = TreeSitterUtil.getDeclaredIdentifiers(currentNode).at(0);
      if (identifier) {
        ancestors.unshift(identifier);
      }
    }

    currentNode = currentNode.parent;
  }

  if (local.node.type === "class_definition") {
    ancestors.pop();
  }

  logger.debug(`Found local: ${local} with ancestors: ${ancestors}`);

  return new UnresolvedAbsoluteReference([
    ...local.document.within,
    ...ancestors,
    ...local.symbols,
  ]);
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
 */
function findReferenceInDocument(
  reference: UnresolvedRelativeReference,
): UnresolvedReference | null {
  if (
    TreeSitterUtil.isDefinition(reference.node) &&
    TreeSitterUtil.hasIdentifier(reference.node, reference.symbols[0])
  ) {
    return reference;
  }

  logger.debug("findReferenceInDocument: Checking for local class or variable...");
  const decl = reference.node.children.find((child) => {
    return (
      (TreeSitterUtil.isDefinition(child) || TreeSitterUtil.isVariableDeclaration(child)) &&
      TreeSitterUtil.hasIdentifier(child, reference.symbols[0])
    );
  });
  if (decl) {
    logger.debug("Found local");
    return new UnresolvedRelativeReference(reference.document, decl, reference.symbols);
  }

  logger.debug("findReferenceInDocument: Checking for declarations in class...");
  const declInClass = findDeclarationInClass(reference.document, reference.node, reference.symbols);
  if (declInClass) {
    return declInClass;
  }

  const importClauses = reference.node.parent?.children.filter(
    (child) => child.type === "import_clause",
  );
  if (importClauses && importClauses.length > 0) {
    logger.debug("findReferenceInDocument: Checking imports...");
    for (const importClause of importClauses) {
      const importResult = resolveImportClause(
        reference.document.project,
        reference.symbols,
        importClause,
      );
      if (importResult) {
        logger.debug("findReferenceInDocument: found import!");
        return importResult;
      }
    }
  }

  if (reference.node.parent) {
    logger.debug("findReferenceInDocument: Checking parent node...");
    return findReferenceInDocument(
      new UnresolvedRelativeReference(reference.document, reference.node.parent, reference.symbols),
    );
  }

  // TODO: check subpackages
  logger.warn("NOT checking subpackages!");

  const referenceWithPackagePath = new UnresolvedAbsoluteReference([
    ...reference.document.packagePath,
    ...reference.symbols,
  ]);
  if (resolveAbsoluteReference(reference.document.project, referenceWithPackagePath)) {
    return referenceWithPackagePath;
  }

  logger.debug("Not found in document. This reference is either global or undefined.");
  return new UnresolvedAbsoluteReference(reference.symbols);
}

function findDeclarationInClass(
  document: ModelicaDocument,
  classNode: Parser.SyntaxNode,
  symbols: string[],
): UnresolvedRelativeReference | undefined {
  if (classNode.type !== "class_definition") {
    return undefined;
  }

  logger.debug(
    `findDeclarationInClass: Checking for declaration ${symbols.join(".")} ` +
      `in class: ${TreeSitterUtil.getDeclaredIdentifiers(classNode)}`,
  );

  const elements = classNode
    .childForFieldName("classSpecifier")
    ?.children?.filter(TreeSitterUtil.isElementList)
    ?.flatMap((element_list) => element_list.namedChildren)
    ?.map((element) => [element, TreeSitterUtil.getDeclaredIdentifiers(element)] as const);

  if (!elements) {
    logger.debug("Didn't find declaration in class");
    return undefined;
  }

  const field = elements.find(
    ([element, idents]) => element.type === "named_element" && idents.includes(symbols[0]),
  );
  if (field) {
    logger.debug(`Resolved ${symbols[0]} to field: ${field[1]}`);

    const classDef = field[0].childForFieldName("classDefinition");
    if (classDef) {
      return new UnresolvedRelativeReference(document, classDef, symbols);
    }

    // TODO: this handles named_elements but what if it's an import clause?
    return new UnresolvedRelativeReference(document, field[0], symbols);
  }

  const extendsClauses = elements
    .map(([element, _idents]) => element)
    .filter((element) => element.type === "extends_clause");
  for (const extendsClause of extendsClauses) {
    const superclassType = TreeSitterUtil.getDeclaredType(extendsClause);
    const unresolvedSuperclass = superclassType.isGlobal
      ? new UnresolvedAbsoluteReference(superclassType.symbols)
      : absolutize(
          new UnresolvedRelativeReference(document, extendsClause, superclassType.symbols),
        );

    if (unresolvedSuperclass == null) {
      logger.warn(`Superclass ${superclassType.symbols} not found`);
      continue;
    }

    logger.debug(
      `Resolving superclass ${unresolvedSuperclass} (of ${
        TreeSitterUtil.getDeclaredIdentifiers(classNode)[0]
      })`,
    );

    const superclass = resolveAbsoluteReference(document.project, unresolvedSuperclass);
    if (!superclass) {
      logger.warn(`Could not find superclass ${unresolvedSuperclass}`);
      continue;
    }

    logger.debug(`Checking superclass ${superclass}`);
    const decl = findDeclarationInClass(superclass.document, superclass.node, symbols);
    if (decl) {
      logger.debug(`Declaration ${decl} found in superclass ${superclass}`);
      return decl;
    }
  }

  return undefined;
}

function resolveImportClause(
  project: ModelicaProject,
  symbols: string[],
  importClause: Parser.SyntaxNode,
): UnresolvedAbsoluteReference | null {
  // imports are always relative according to the grammar
  const importPath = TreeSitterUtil.getDeclaredType(
    importClause.childForFieldName("name")!,
  ).symbols;

  // wildcard import: import a.b.*;
  const isWildcard = importClause.childForFieldName("wildcard") != null;
  if (isWildcard) {
    const importCandidate = new UnresolvedAbsoluteReference([...importPath, ...symbols]);
    logger.debug(`Candidate: ${importCandidate} (from import ${importPath.join(".")}.*)`);

    // TODO: this should probably not resolve the reference fully, then immediately
    // discard it so it can do so again.
    if (resolveAbsoluteReference(project, importCandidate)) {
      return importCandidate;
    }
  }

  // import alias: import z = a.b.c;
  // TODO: Determine if import aliases should be counted as "declarations".
  //       If so, then we should stop here for decls when symbols.length == 1.
  const alias = importClause.childForFieldName("alias")?.text;
  if (alias && alias === symbols[0]) {
    const importCandidate = new UnresolvedAbsoluteReference([...importPath, ...symbols.slice(1)]);
    logger.debug(`Candidate: ${importCandidate} (from import ${alias} = ${importPath.join(".")})`);

    return importCandidate;
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

    return importCandidate;
  }

  // normal import: import a.b.c;
  if (importPath.at(-1) === symbols[0]) {
    const importCandidate = new UnresolvedAbsoluteReference([...importPath, ...symbols.slice(1)]);
    logger.debug(`Candidate: ${importCandidate} (from import ${importPath.join(".")})`);

    return importCandidate;
  }

  return null;
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

  logger.debug(`Resolving absolute reference ${reference}`);

  const library = project.libraries.find((lib) => lib.name === reference.symbols[0]);
  if (library == null) {
    logger.debug(`Couldn't find library: ${reference.symbols[0]}`);
    return null;
  }

  logger.debug(`Found library ${library.name}; performing resolution: `);

  let alreadyResolved: ResolvedReference | null = null;
  for (let i = 0; i < reference.symbols.length; i++) {
    alreadyResolved = resolveNext(library, reference, alreadyResolved);
    logger.debug(`resolveNext found symbol: ${alreadyResolved != null}`);
    if (alreadyResolved == null) {
      return null;
    }

    logger.debug(`Step ${i + 1}: ${alreadyResolved}`);

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

      logger.debug(`  => class: ${classRef}`);
      alreadyResolved = classRef;
    }
  }

  logger.debug(`Resolved symbol ${alreadyResolved?.symbols} in ${alreadyResolved?.document.path}`);

  return alreadyResolved;
}

/**
 * Performs a single iteration of the resolution algorithm.
 *
 * @param reference the entire reference
 * @param alreadyResolved a resolved reference (to a class)
 * @returns the next resolved reference
 */
function resolveNext(
  library: ModelicaLibrary,
  reference: UnresolvedAbsoluteReference,
  alreadyResolved: ResolvedReference | null,
): ResolvedReference | null {
  // If at the root level, find the root package
  if (!alreadyResolved) {
    logger.debug(`Resolve next: ${reference.symbols[0]}`);
    const documentPath = path.join(library.path, "package.mo");
    const [document, packageClass] = getPackageClassFromFilePath(
      library,
      documentPath,
      reference.symbols[0],
    );
    if (!document || !packageClass) {
      logger.debug(`Couldn't find package class: ${reference.symbols[0]} in ${documentPath}`);
      return null;
    }

    return new ResolvedReference(document, packageClass, reference.symbols.slice(0, 1));
  }

  const nextSymbolIndex = alreadyResolved.symbols.length;
  const nextSymbol = reference.symbols[nextSymbolIndex];
  logger.debug(
    `Resolve next: ${nextSymbol} (alreadyResolved: ${
      alreadyResolved.node.type
    } with ident ${TreeSitterUtil.getIdentifier(alreadyResolved.node)})`,
  );

  // If there is a document for nextSymbol blablabla
  const dirName = path.dirname(alreadyResolved.document.path);
  const potentialPaths = [
    path.join(dirName, `${nextSymbol}.mo`),
    path.join(dirName, `${nextSymbol}/package.mo`),
  ];
  logger.debug(`resolveNext potentialPaths: ${potentialPaths}`);
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
      reference.symbols.slice(0, nextSymbolIndex + 1),
    );
  }

  // If nextSymbol is in alreadyResolved.node:
  //    return the declaration
  // TODO: Variable declarations may be nested inside an element list
  const child = findDeclarationInClass(
    alreadyResolved.document,
    alreadyResolved.node,
    reference.symbols.slice(nextSymbolIndex),
  );
  if (child) {
    return new ResolvedReference(
      child.document,
      child.node,
      reference.symbols.slice(0, nextSymbolIndex + 1),
    );
  }

  logger.debug(`Couldn't find document for ${nextSymbol}`);

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
  const type = TreeSitterUtil.getDeclaredType(varRef.node);

  const absoluteReference = (() => {
    if (type.isGlobal) {
      return new UnresolvedAbsoluteReference(type.symbols);
    } else {
      const typeRef = new UnresolvedRelativeReference(varRef.document, varRef.node, type.symbols);
      return absolutize(typeRef);
    }
  })();

  if (absoluteReference === null) {
    return null;
  }

  if (absoluteReference instanceof ResolvedReference) {
    return absoluteReference;
  }

  return resolveAbsoluteReference(varRef.document.project, absoluteReference);
}
