/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

/**
 * Which languages `listings` can highlight, and definitions for the ones it cannot.
 *
 * This list is MEASURED, not copied from documentation: an unknown language is a HARD
 * ERROR — `language=Nonesuch` fails with *Package Listings Error: Couldn't load requested
 * language* and produces no PDF — so the picker must offer exactly what the bundled
 * TeX Live can load, and nothing else.
 *
 * Of 62 candidates compiled against the engine, nine failed: JavaScript, TypeScript,
 * Rust, Kotlin, JSON, YAML, Lua, Makefile and Assembler. The first seven are common
 * enough to be worth defining ourselves — `\lstdefinelanguage` works, and each definition
 * below was compiled with a sample of that language before being checked in. Makefile and
 * Assembler are left out: Assembler needs a dialect (`language={[x86masm]Assembler}`) and
 * a Makefile is mostly tabs and shell.
 *
 * To re-measure after a TeX Live update, compile `\begin{lstlisting}[language=X]` for each
 * candidate and keep the ones that do not error.
 */

/** Languages the bundled `listings` already knows. Measured. */
export const LST_BUILTIN_LANGUAGES: readonly string[] = [
  'Ada', 'Awk', 'C', 'C++', 'Caml', 'Cobol', 'Csh', 'Delphi', 'Eiffel', 'Elan', 'Erlang',
  'Euphoria', 'Fortran', 'Gnuplot', 'Go', 'HTML', 'Haskell', 'Java', 'Lisp', 'ML',
  'Mathematica', 'Matlab', 'Mercury', 'MetaPost', 'Miranda', 'Modula-2', 'Oberon-2', 'OCL',
  'Octave', 'PHP', 'POV', 'PSTricks', 'Pascal', 'Perl', 'Plasm', 'Prolog', 'Python', 'R',
  'Ruby', 'SQL', 'Scala', 'Scilab', 'Simula', 'Swift', 'TeX', 'VBScript', 'VHDL', 'Verilog',
  'XML', 'XSLT', 'bash', 'sh', 'tcl',
];

/**
 * Definitions for languages `listings` does not ship.
 *
 * One line each, because `DERIVED_SETUP_LINES` matches preamble lines by exact string:
 * a definition split over several lines could not be recognised on the way back in, and
 * the preamble would grow a duplicate on every round trip.
 */
export const LST_DEFINITIONS: Readonly<Record<string, string>> = {
  JSON:
    '\\lstdefinelanguage{JSON}{morekeywords={true,false,null},sensitive=true,'
    + 'morestring=[b]"}',
  JavaScript:
    '\\lstdefinelanguage{JavaScript}{morekeywords={async,await,break,case,catch,class,'
    + 'const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,'
    + 'if,import,in,instanceof,let,new,of,return,static,super,switch,this,throw,try,typeof,'
    + 'var,void,while,with,yield},morekeywords=[2]{true,false,null,undefined,NaN,Infinity},'
    + "sensitive=true,morecomment=[l]{//},morecomment=[s]{/*}{*/},morestring=[b]',"
    + 'morestring=[b]",morestring=[b]`}',
  Kotlin:
    '\\lstdefinelanguage{Kotlin}{morekeywords={as,break,by,catch,class,companion,'
    + 'constructor,continue,data,do,else,enum,false,finally,for,fun,if,import,in,init,'
    + 'interface,internal,is,lateinit,null,object,open,out,override,package,private,'
    + 'protected,public,return,sealed,super,suspend,this,throw,true,try,typealias,val,var,'
    + 'vararg,when,where,while},sensitive=true,morecomment=[l]{//},'
    + 'morecomment=[s]{/*}{*/},morestring=[b]"}',
  Lua:
    '\\lstdefinelanguage{Lua}{morekeywords={and,break,do,else,elseif,end,false,for,'
    + 'function,goto,if,in,local,nil,not,or,repeat,return,then,true,until,while},'
    + "sensitive=true,morecomment=[l]{--},morecomment=[s]{--[[}{]]},morestring=[b]',"
    + 'morestring=[b]"}',
  Rust:
    '\\lstdefinelanguage{Rust}{morekeywords={as,async,await,break,const,continue,crate,'
    + 'dyn,else,enum,extern,fn,for,if,impl,in,let,loop,match,mod,move,mut,pub,ref,return,'
    + 'self,Self,static,struct,super,trait,type,unsafe,use,where,while},'
    + 'morekeywords=[2]{true,false,None,Some,Ok,Err},sensitive=true,morecomment=[l]{//},'
    + 'morecomment=[s]{/*}{*/},morestring=[b]"}',
  TypeScript:
    '\\lstdefinelanguage{TypeScript}{morekeywords={abstract,any,as,async,await,boolean,'
    + 'break,case,catch,class,const,continue,declare,default,delete,do,else,enum,export,'
    + 'extends,finally,for,from,function,if,implements,import,in,instanceof,interface,keyof,'
    + 'let,namespace,never,new,number,of,private,protected,public,readonly,return,static,'
    + 'string,super,switch,this,throw,try,type,typeof,unknown,var,void,while,yield},'
    + 'morekeywords=[2]{true,false,null,undefined},sensitive=true,morecomment=[l]{//},'
    + "morecomment=[s]{/*}{*/},morestring=[b]',morestring=[b]\",morestring=[b]`}",
  YAML:
    '\\lstdefinelanguage{YAML}{morekeywords={true,false,null,yes,no,on,off},'
    + "sensitive=true,morecomment=[l]{\\#},morestring=[b]',morestring=[b]\"}",
};

/**
 * The house style for every listing.
 *
 * `structure.fg` is beamer's own colour, so keywords follow the deck's theme rather than
 * being a fixed blue. Verified to compile: xcolor resolves it inside `\lstset`.
 */
export const LST_SETUP =
  '\\lstset{basicstyle=\\ttfamily\\small,keywordstyle=\\color{structure.fg},'
  + 'commentstyle=\\itshape\\color{gray},stringstyle=\\color{teal},showstringspaces=false,'
  + 'breaklines=true,columns=fullflexible,numberstyle=\\tiny\\color{gray}}';

/** Every language the picker offers. */
export const LST_LANGUAGES: readonly string[] = [
  ...LST_BUILTIN_LANGUAGES,
  ...Object.keys(LST_DEFINITIONS),
].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

/** True when this language needs a `\lstdefinelanguage` before it can be used. */
export function lstNeedsDefinition(language: string): boolean {
  return language in LST_DEFINITIONS;
}

/**
 * The preamble lines a deck's listings need: the house style, then one definition per
 * language used that `listings` does not know.
 *
 * Sorted, because the round trip is only a fixpoint if the order is stable.
 */
export function lstSetupLines(languages: Iterable<string>): string[] {
  const defs = [...new Set(languages)]
    .filter(lstNeedsDefinition)
    .sort()
    .map((l) => LST_DEFINITIONS[l]!);
  return [LST_SETUP, ...defs];
}

/** Every line this module can emit, for the parser's ownership set. */
export const LST_SETUP_LINES: readonly string[] = [
  LST_SETUP,
  ...Object.keys(LST_DEFINITIONS).sort().map((l) => LST_DEFINITIONS[l]!),
];
