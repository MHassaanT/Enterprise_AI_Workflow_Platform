import re
import ast
import operator
from typing import Any, Dict, Union

# Define allowed operators for expression evaluation
ALLOWED_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.And: operator.and_,
    ast.Or: operator.or_,
    ast.Not: operator.not_,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
    ast.In: operator.contains,
}

def resolve_context_path(path: str, context: Dict[str, Any]) -> Any:
    """
    Resolve a dot-separated path (e.g., 'trigger.body.amount') against the context dictionary.
    """
    keys = path.split('.')
    value = context
    for key in keys:
        if isinstance(value, dict) and key in value:
            value = value[key]
        else:
            # Try attribute access for Pydantic models / objects
            if hasattr(value, key):
                value = getattr(value, key)
            else:
                raise KeyError(f"Variable path '{path}' not found in context (failed at '{key}')")
    return value

def substitute_variables(template: Any, context: Dict[str, Any]) -> Any:
    """
    Recursively replace {{variable.path}} in strings, lists, and dicts.
    If a string is EXACTLY '{{variable}}', the actual typed value is returned (e.g., an integer or dict).
    """
    if isinstance(template, str):
        # Check if the entire string is just one variable
        exact_match = re.fullmatch(r"\{\{([^}]+)\}\}", template.strip())
        if exact_match:
            var_path = exact_match.group(1).strip()
            return resolve_context_path(var_path, context)
        
        # Otherwise, perform string substitution
        def repl(match):
            var_path = match.group(1).strip()
            try:
                val = resolve_context_path(var_path, context)
                return str(val)
            except KeyError:
                return match.group(0) # Leave unresolved variables as-is or raise? The prompt says "Raises VariableNotFoundError"

        # Find all {{ ... }}
        result = re.sub(r"\{\{([^}]+)\}\}", repl, template)
        
        # Check if any variables were not resolved (if we want to raise an error)
        # For strict validation, we will raise an error on substitution failure
        if "{{" in result:
            unresolved = re.findall(r"\{\{([^}]+)\}\}", result)
            if unresolved:
                raise ValueError(f"VariableNotFoundError: Could not resolve references: {unresolved}")
        return result
        
    elif isinstance(template, dict):
        return {k: substitute_variables(v, context) for k, v in template.items()}
    elif isinstance(template, list):
        return [substitute_variables(item, context) for item in template]
    else:
        return template

def safe_eval_node(node: ast.AST, context: Dict[str, Any]) -> Any:
    """
    Recursively evaluate an AST node safely.
    """
    if isinstance(node, ast.Constant): # Python 3.8+
        return node.value
    elif isinstance(node, ast.Name):
        if node.id in context:
            return context[node.id]
        elif node.id == 'null':
            return None
        elif node.id == 'true':
            return True
        elif node.id == 'false':
            return False
        else:
            raise NameError(f"Name '{node.id}' is not defined in context")
    elif isinstance(node, ast.BinOp):
        left = safe_eval_node(node.left, context)
        right = safe_eval_node(node.right, context)
        if type(node.op) in ALLOWED_OPERATORS:
            return ALLOWED_OPERATORS[type(node.op)](left, right)
        else:
            raise TypeError(f"Unsupported binary operator: {type(node.op)}")
    elif isinstance(node, ast.BoolOp):
        if isinstance(node.op, ast.And):
            for value in node.values:
                if not safe_eval_node(value, context):
                    return False
            return True
        elif isinstance(node.op, ast.Or):
            for value in node.values:
                if safe_eval_node(value, context):
                    return True
            return False
        raise TypeError(f"Unsupported boolean operator: {type(node.op)}")
    elif isinstance(node, ast.UnaryOp):
        operand = safe_eval_node(node.operand, context)
        if type(node.op) in ALLOWED_OPERATORS:
            return ALLOWED_OPERATORS[type(node.op)](operand)
        raise TypeError(f"Unsupported unary operator: {type(node.op)}")
    elif isinstance(node, ast.Compare):
        left = safe_eval_node(node.left, context)
        for op, comparator in zip(node.ops, node.comparators):
            right = safe_eval_node(comparator, context)
            if type(op) in ALLOWED_OPERATORS:
                if not ALLOWED_OPERATORS[type(op)](left, right):
                    return False
                left = right
            else:
                raise TypeError(f"Unsupported comparison operator: {type(op)}")
        return True
    else:
        raise TypeError(f"Unsupported expression node type: {type(node)}")

def evaluate_expression(expr: str, context: Dict[str, Any]) -> bool:
    """
    Safely evaluate a boolean expression using values from context.
    Support: {{vars}}, ==, !=, >, <, >=, <=, &&, ||, !
    """
    # First, substitute {{vars}} into their actual string representation, 
    # but wait, substituting into a string might break types (e.g. string vs int).
    # It's better to extract the variables and put them into the `context` for AST evaluation.
    
    # We will replace {{var.path}} with a safe identifier and inject it into a local context.
    local_context = {}
    
    def repl(match):
        var_path = match.group(1).strip()
        safe_name = var_path.replace('.', '_')
        local_context[safe_name] = resolve_context_path(var_path, context)
        return safe_name

    # Replace variables with safe identifiers
    expr_transformed = re.sub(r"\{\{([^}]+)\}\}", repl, expr)
    
    # Replace && with ' and ', || with ' or ', ! with ' not ' for Python AST parsing
    expr_transformed = expr_transformed.replace('&&', ' and ').replace('||', ' or ').replace('!', ' not ')

    try:
        tree = ast.parse(expr_transformed, mode='eval')
        return bool(safe_eval_node(tree.body, local_context))
    except Exception as e:
        raise ValueError(f"Failed to evaluate expression '{expr}': {str(e)}")
