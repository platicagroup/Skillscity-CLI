export const queryTypescript = `
; Function declarations
(function_declaration
  name: (identifier) @definition.function
  parameters: (formal_parameters) @definition.function
) @definition.function

; Function expressions assigned to variables
(variable_declarator
  name: (identifier) @definition.function
  value: (function_expression) @definition.function
)

; Arrow functions
(arrow_function) @definition.function

; Class declarations
(class_declaration
  name: (identifier) @definition.class
) @definition.class

; Method definitions inside classes
(method_definition
  name: (property_identifier) @definition.method
  parameters: (formal_parameters) @definition.method
) @definition.method

; Interface declarations
(interface_declaration
  name: (type_identifier) @definition.interface
) @definition.interface

; Type aliases
(type_alias_declaration
  name: (type_identifier) @definition.type
) @definition.type

; Enum declarations
(enum_declaration
  name: (identifier) @definition.enum
) @definition.enum

; Import statements
(import_statement) @definition.import

; Export statements
(export_statement) @definition.import

; Comments
(comment) @comment
`;