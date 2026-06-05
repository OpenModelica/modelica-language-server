within TestLibrary.TestPackage;

import TestLibrary.Constants.pi;

function TestClass
	input Real twoE = 2 * Constants.e;
	input Real tau = 2 * pi;
	input Real notTau = tau / twoE;
end TestClass;
