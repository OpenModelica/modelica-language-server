```modelica
class Modelica_Blocks_Sources_Step "Generate step signal of type Real"
```
---

**Parameter Inputs**
```modelica
parameter input Real height = 1.0 "Height of step";
```
**Outputs**
```modelica
output Real y "Connector of Real output signal";
```

**Parameter**
```modelica
parameter input Real height = 1.0 "Height of step";
parameter Real offset = 0.0 "Offset of output signal y";
parameter Real startTime(quantity = "Time", unit = "s") = 0.0 "Output y = offset for time < startTime";
```
